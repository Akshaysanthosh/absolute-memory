import { getDatabase } from '@/server/db';
import { deleteSession, listSessions } from '@/server/repos/sessions';

type CurrentSession = { id: string; userId: string; createdAt: Date };

export async function listAccountSessions(session: CurrentSession) {
  const sessions = await listSessions(await getDatabase(), session.userId);
  return sessions.map((row) => ({
    id: row.id,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastActiveAt: row.updated_at,
    expiresAt: row.expires_at,
    current: row.id === session.id,
  }));
}

export async function endAccountSession(session: CurrentSession, id: string) {
  if (id === session.id) return 'current';
  // Use the same five-minute window as Better Auth's freshAge.
  if (Date.now() - new Date(session.createdAt).getTime() > 300_000) return 'stale';
  const deleted = await deleteSession(await getDatabase(), session.userId, id);
  return deleted ? 'ended' : 'missing';
}
