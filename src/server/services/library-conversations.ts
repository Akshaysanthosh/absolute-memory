import { HttpError } from '@/server/auth/http';
import { getDatabase } from '@/server/db';
import {
  deleteConversation,
  findConversation,
  listConversationThreads,
  listConversationTurns,
} from '@/server/repos/library-chats';
import { sourceAvailability } from '@/server/services/knowledge/citations';

export async function listLibraryConversations(userId: string) {
  return (await listConversationThreads(await getDatabase(), userId)).rows;
}

export async function getLibraryConversation(userId: string, id: string) {
  const db = await getDatabase();
  const thread = (await findConversation(db, id, userId)).rows[0];
  if (!thread) throw new HttpError(404, 'Conversation not found.');
  const rows = await listConversationTurns(db, id, userId);
  return {
    thread,
    turns: await Promise.all(
      rows.rows.map(async (turn) => ({
        ...turn,
        state:
          turn.state === 'running' && Date.now() - new Date(turn.created_at).getTime() > 180_000
            ? 'failed'
            : turn.state,
        sources: await sourceAvailability(userId, turn.sources, db),
      })),
    ),
  };
}

export async function removeLibraryConversation(userId: string, id: string) {
  await deleteConversation(await getDatabase(), id, userId);
}
