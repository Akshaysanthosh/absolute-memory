import type { Queryable } from '@/server/db';

export async function reserveWelcomeSample(db: Queryable, userId: string) {
  const { rows } = await db.query(
    `INSERT INTO sample_seed(user_id, keys) VALUES($1, ARRAY['welcome'])
    ON CONFLICT DO NOTHING RETURNING user_id`,
    [userId],
  );
  return rows.length > 0;
}

export async function setSampleKey(db: Queryable, userId: string, id: string, key: string) {
  await db.query('UPDATE item SET sample_key=$3 WHERE id=$1 AND user_id=$2', [id, userId, key]);
}

export async function deleteSampleItems(db: Queryable, userId: string) {
  const { rows } = await db.query(
    'DELETE FROM item WHERE user_id=$1 AND sample_key IS NOT NULL RETURNING id',
    [userId],
  );
  return rows.length;
}

export async function markSamplesRemoved(db: Queryable, userId: string) {
  await db.query(
    'UPDATE sample_seed SET removed_at=now() WHERE user_id=$1 AND removed_at IS NULL',
    [userId],
  );
}

export async function hasSampleOrMatchingUrl(
  db: Queryable,
  userId: string,
  url: string,
  key: string,
) {
  const { rows } = await db.query(
    'SELECT id FROM item WHERE user_id=$1 AND (url=$2 OR sample_key=$3)',
    [userId, url, key],
  );
  return rows.length > 0;
}

export async function recordSamplesAdded(db: Queryable, userId: string, added: string[]) {
  await db.query(
    `INSERT INTO sample_seed(user_id,keys) VALUES($1,$2)
    ON CONFLICT(user_id) DO UPDATE
    SET keys=(SELECT ARRAY(SELECT DISTINCT unnest(sample_seed.keys||EXCLUDED.keys))), removed_at=NULL`,
    [userId, added],
  );
}
