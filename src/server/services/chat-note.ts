import { HttpError } from '@/server/auth/http';
import { getDatabase } from '@/server/db';
import { findCaptureFromTurn } from '@/server/repos/item-capture';
import { listSourceTagsForItems } from '@/server/repos/item-tags';
import { findTurnToSave } from '@/server/repos/library-chats';
import { setTags } from '@/server/services/knowledge/item-knowledge';
import { sourceAvailability } from '@/server/services/knowledge/citations';
import { capture } from '@/server/services/library';
import { passageUrl, type KnowledgeSource } from '@/shared/knowledge/shared';
export function chatNoteText(
  question: string,
  answer: string,
  sources: KnowledgeSource[],
  origin: string,
) {
  return `${question}\n\n${answer}\n\nSources\n\n${sources.map((s) => (s.type === 'saved' ? `[${s.key}] ${s.title}\n${origin}${passageUrl(s.itemId, s.passageIndex)}\n“${s.quote}”` : `[${s.key}] ${s.title}\n${s.url}`)).join('\n\n')}`;
}

export async function saveLibraryAnswer(
  userId: string,
  threadId: string,
  turnId: string,
  origin: string,
) {
  const db = await getDatabase();
  const turn = (await findTurnToSave(db, turnId, threadId, userId)).rows[0];
  if (!turn) throw new HttpError(404, 'Answer not found.');
  if (turn.state !== 'complete' || !turn.answer.trim())
    throw new HttpError(409, 'Wait for the answer to finish before saving.');

  const existing = (await findCaptureFromTurn(db, userId, turnId)).rows[0];
  if (existing) return { id: existing.id, created: false };
  const sources = await sourceAvailability(userId, turn.sources, db);
  const result = await capture(
    userId,
    {
      kind: 'note',
      title: turn.question.slice(0, 300),
      text: chatNoteText(turn.question, turn.answer, sources, origin),
    },
    'web',
    db,
    turnId,
  );
  const ids = sources.filter((s) => s.type === 'saved').map((s) => s.itemId);
  const tags = await listSourceTagsForItems(db, userId, ids);
  await setTags(
    userId,
    result.item.id,
    tags.rows.map((t) => t.name),
    db,
  );
  return { id: result.item.id, created: true };
}
