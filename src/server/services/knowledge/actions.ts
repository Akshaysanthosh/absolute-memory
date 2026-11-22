import { lockUser } from '@/server/repos/users';
import {
  findRunningTurn,
  findTurnByRequest,
  findOwnedThreadId,
  insertConversationThread,
  listConversationHistory,
  insertConversationTurn,
} from '@/server/repos/library-chats';
import { randomUUID } from 'node:crypto';
import type { Database, Queryable } from '@/server/db';
import { HttpError } from '@/server/auth/http';

export async function reserveAction(tx: Queryable, userId: string) {
  await lockUser(tx, userId);
  const busy = await findRunningTurn(tx, userId);
  if (busy.rows.length)
    throw new HttpError(409, 'An AI request is already running. Wait for it to finish.');
}
export async function reserveLibraryTurn(
  userId: string,
  input: { threadId?: string; requestId: string; question: string; web: boolean },
  model: string,
  db: Database,
) {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    if ((await findTurnByRequest(tx, userId, input.requestId)).rows.length)
      throw new HttpError(409, 'This question was already submitted. Reopen the conversation.');
    let threadId = input.threadId;
    if (threadId) {
      if (!(await findOwnedThreadId(tx, userId, threadId)).rows.length)
        throw new HttpError(404, 'Conversation not found.');
    } else {
      threadId = randomUUID();
      await insertConversationThread(tx, threadId, userId, input.question.slice(0, 100));
    }
    const history = (await listConversationHistory(tx, threadId, userId)).rows;
    if (history.length >= 20)
      throw new HttpError(429, 'Start a new conversation after 20 questions.');
    await reserveAction(tx, userId);
    const id = randomUUID();
    await insertConversationTurn(
      tx,
      id,
      userId,
      threadId,
      input.requestId,
      input.question,
      input.web,
      model,
    );
    return { id, threadId, history };
  });
}
