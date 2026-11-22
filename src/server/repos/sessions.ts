import type { Queryable } from '@/server/db';

export async function listSessions(db: Queryable, userId: string) {
  const { rows } = await db.query<{
    id: string;
    user_agent: string | null;
    created_at: Date;
    updated_at: Date;
    expires_at: Date;
  }>(
    `SELECT id, user_agent, created_at, updated_at, expires_at
    FROM "session" WHERE user_id=$1 AND expires_at>now()
    ORDER BY updated_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

export async function deleteSession(db: Queryable, userId: string, id: string) {
  const { rows } = await db.query('DELETE FROM "session" WHERE id=$1 AND user_id=$2 RETURNING id', [
    id,
    userId,
  ]);
  return rows.length > 0;
}
