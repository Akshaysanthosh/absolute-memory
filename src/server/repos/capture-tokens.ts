import type { Queryable } from '@/server/db';

export async function listCaptureTokens(db: Queryable, userId: string) {
  const { rows } = await db.query(
    `SELECT id, name, created_at, last_used_at FROM capture_token
    WHERE user_id=$1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function insertCaptureToken(
  db: Queryable,
  token: { id: string; userId: string; name: string; hash: string },
) {
  await db.query('INSERT INTO capture_token(id,user_id,name,token_hash) VALUES($1,$2,$3,$4)', [
    token.id,
    token.userId,
    token.name,
    token.hash,
  ]);
}

export async function deleteCaptureToken(db: Queryable, userId: string, id: string) {
  await db.query('DELETE FROM capture_token WHERE id=$1 AND user_id=$2', [id, userId]);
}

export async function findCaptureToken(db: Queryable, hash: string) {
  const { rows } = await db.query<{ user_id: string; id: string }>(
    'SELECT user_id,id FROM capture_token WHERE token_hash = $1',
    [hash],
  );
  return rows[0];
}

export async function touchCaptureToken(db: Queryable, userId: string, id: string) {
  await db.query(
    `UPDATE capture_token SET last_used_at=now() WHERE id=$1 AND user_id=$2
    AND (last_used_at IS NULL OR last_used_at<now()-interval '5 minutes')`,
    [id, userId],
  );
}

export function matchCaptureToken(db: Queryable, id: string | null, userId: string, hash: string) {
  return db.query('SELECT id FROM capture_token WHERE id=$1 AND user_id=$2 AND token_hash=$3', [
    id,
    userId,
    hash,
  ]);
}
