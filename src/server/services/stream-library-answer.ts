import { checkpointConversationTurn, finishConversationTurn } from '@/server/repos/library-chats';
import { findOwnedItemIds } from '@/server/repos/items';
import { getChatModel } from '@/server/providers';
import { HttpError } from '@/server/auth/http';
import { getDatabase } from '@/server/db';
import { reserveLibraryTurn } from '@/server/services/knowledge/actions';
import { answerInstructions } from '@/server/services/knowledge/answer';
import { retrieve } from '@/server/services/knowledge/retrieval';
import { recordCall } from '@/server/services/knowledge/usage';
import { validateCitations, type KnowledgeSource } from '@/shared/knowledge/shared';

type LibraryAsk = {
  requestId: string;
  threadId?: string;
  question: string;
  itemIds: string[];
  tags: string[];
  excludeChatNotes: boolean;
};

type AnswerState = 'failed' | 'complete' | 'stopped';
type AnswerEvent =
  | { type: 'start'; threadId: string; turnId: string }
  | { type: 'context'; pending: number; degraded: boolean; sources: KnowledgeSource[] }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      turn: {
        id: string;
        question: string;
        answer: string;
        state: AnswerState;
        sources: KnowledgeSource[];
      };
      error?: string;
    }
  | { type: 'error'; error: string };

export async function streamLibraryAnswer(
  userId: string,
  input: LibraryAsk,
  requestSignal: AbortSignal,
) {
  const chat = getChatModel();
  if (!chat)
    throw new HttpError(503, 'Connect an AI provider to ask questions about your library.');
  const model = chat.name;
  const db = await getDatabase();
  if (input.itemIds.length) {
    const owned = await findOwnedItemIds(db, userId, input.itemIds);
    if (owned.rows.length !== new Set(input.itemIds).size)
      throw new HttpError(404, 'Selected item not found.');
  }
  const reservation = await reserveLibraryTurn(userId, { ...input, web: false }, model, db);
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, requestSignal, AbortSignal.timeout(110_000)]);
  let disconnected = false;
  return new ReadableStream<AnswerEvent>({
    async start(output) {
      let answer = '',
        state: AnswerState = 'failed',
        inputTokens = 0,
        outputTokens = 0;
      const sources: KnowledgeSource[] = [];
      const started = Date.now();
      const send = (data: AnswerEvent) => {
        if (!disconnected)
          try {
            output.enqueue(data);
          } catch {
            disconnected = true;
            controller.abort();
          }
      };
      send({ type: 'start', threadId: reservation.threadId, turnId: reservation.id });
      try {
        const previousQuestion = reservation.history
          .filter((h) => h.state === 'complete')
          .at(-1)?.question;
        const retrieval = await retrieve(
          userId,
          previousQuestion ? `${previousQuestion}\n${input.question}` : input.question,
          input,
          db,
        );
        if (signal.aborted) throw new Error('Stopped');
        retrieval.evidence.forEach((s, i) =>
          sources.push({
            type: 'saved',
            key: String(i + 1),
            itemId: s.itemId,
            title: s.title,
            passageIndex: s.passageIndex,
            quote: s.text,
            available: true,
          }),
        );
        send({
          type: 'context',
          pending: retrieval.pending,
          degraded: retrieval.degraded,
          sources,
        });
        if (!retrieval.evidence.length) {
          answer =
            'I could not find supporting passages in your saved library. Try a more specific question or wait for indexing to finish.';
          send({ type: 'delta', text: answer });
          state = 'complete';
        } else {
          let lastCheckpoint = Date.now();
          const result = chat.streamText({
            instructions: answerInstructions,
            messages: [
              ...reservation.history
                .filter((h) => h.state === 'complete')
                .slice(-6)
                .flatMap((h) => [
                  { role: 'user' as const, content: h.question },
                  { role: 'assistant' as const, content: h.answer },
                ]),
              {
                role: 'user',
                content: JSON.stringify({
                  question: input.question,
                  savedPassages: retrieval.evidence.map((e, i) => ({
                    number: i + 1,
                    title: e.title,
                    text: e.text,
                  })),
                }),
              },
            ],
            maxOutputTokens: 2000,
            abortSignal: signal,
          });
          for await (const p of result.fullStream) {
            if (p.type === 'text-delta') {
              answer += p.text;
              send({ type: 'delta', text: p.text });
              if (Date.now() - lastCheckpoint > 2000) {
                await checkpointConversationTurn(
                  db,
                  reservation.id,
                  userId,
                  validateCitations(answer, sources),
                  JSON.stringify(sources),
                );
                lastCheckpoint = Date.now();
              }
            }
            if (p.type === 'finish') {
              inputTokens = p.totalUsage.inputTokens || 0;
              outputTokens = p.totalUsage.outputTokens || 0;
              state = answer.trim()
                ? p.finishReason === 'length'
                  ? 'stopped'
                  : 'complete'
                : 'failed';
            }
            if (p.type === 'error') throw new Error('Provider failed');
            if (p.type === 'abort') state = 'stopped';
          }
        }
      } catch {
        state = signal.aborted ? 'stopped' : 'failed';
      }
      answer = validateCitations(answer, sources);
      try {
        await finishConversationTurn(
          db,
          reservation.id,
          userId,
          answer,
          state,
          JSON.stringify(sources),
          inputTokens,
          outputTokens,
        );
        await recordCall(
          db,
          userId,
          'library-chat',
          started,
          { value: null, model, inputTokens, outputTokens },
          state === 'failed',
        );
        send({
          type: 'done',
          turn: { id: reservation.id, question: input.question, answer, state, sources },
          ...(state !== 'complete'
            ? {
                error:
                  state === 'stopped'
                    ? 'Answer stopped. The partial response was saved.'
                    : 'The answer could not finish. Please try again.',
              }
            : {}),
        });
      } catch {
        send({
          type: 'error',
          error: 'The answer could not be saved. Reopen the conversation before retrying.',
        });
      }
      if (!disconnected)
        try {
          output.close();
        } catch {}
    },
    cancel() {
      disconnected = true;
      controller.abort();
    },
  });
}
