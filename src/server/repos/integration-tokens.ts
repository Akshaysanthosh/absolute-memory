import type { Queryable } from '@/server/db';

const scopes = ['library:read', 'library:write'] as const;
export type IntegrationScope = (typeof scopes)[number];
export type KeyIdentity = { id: string; user_id: string; scopes: IntegrationScope[] };
export { scopes };

export async function listActiveTokens(db: Queryable, userId: string) {
  const { rows } = await db.query(
    `SELECT id, label, scopes, created_at, expires_at, last_used_at
    FROM integration_token WHERE user_id=$1 AND (expires_at IS NULL OR expires_at>now())
    ORDER BY created_at DESC, id`,
    [userId],
  );
  return rows;
}

export async function deleteExpiredTokens(db: Queryable, userId: string) {
  await db.query('DELETE FROM integration_token WHERE user_id=$1 AND expires_at<=now()', [userId]);
}

export async function countTokens(db: Queryable, userId: string) {
  const { rows } = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM integration_token WHERE user_id=$1',
    [userId],
  );
  return rows[0].count;
}

export async function insertIntegrationToken(
  db: Queryable,
  token: {
    id: string;
    userId: string;
    label: string;
    hash: string;
    scopes: IntegrationScope[];
    expiresInDays: number | null;
  },
) {
  const { rows } = await db.query(
    `INSERT INTO integration_token(id,user_id,label,token_hash,scopes,expires_at)
    VALUES($1,$2,$3,$4,$5,now()+$6::int*interval '1 day')
    RETURNING id,label,scopes,created_at,expires_at,last_used_at`,
    [token.id, token.userId, token.label, token.hash, token.scopes, token.expiresInDays],
  );
  return rows[0];
}

export async function deleteIntegrationToken(db: Queryable, userId: string, id: string) {
  const { rows } = await db.query(
    'DELETE FROM integration_token WHERE user_id=$1 AND id=$2 RETURNING id',
    [userId, id],
  );
  return rows.length > 0;
}

export async function findActiveToken(db: Queryable, hash: string) {
  const { rows } = await db.query<KeyIdentity>(
    `SELECT id, user_id, scopes FROM integration_token
    WHERE token_hash=$1 AND (expires_at IS NULL OR expires_at>now())`,
    [hash],
  );
  return rows[0];
}

export async function touchIntegrationToken(db: Queryable, key: KeyIdentity) {
  await db.query(
    `UPDATE integration_token SET last_used_at=now() WHERE id=$1 AND user_id=$2
    AND (last_used_at IS NULL OR last_used_at<now()-interval '5 minutes')`,
    [key.id, key.user_id],
  );
}
