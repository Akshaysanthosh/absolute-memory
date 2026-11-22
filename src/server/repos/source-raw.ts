import type { Queryable } from '@/server/db';

export function storeRawCapture(
  db: Queryable,
  id: string,
  userId: string,
  provider: string,
  version: number,
  dataJson: string,
) {
  return db.query(
    `INSERT INTO item_source_raw(item_id,user_id,provider,version,data) VALUES($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT(item_id) DO UPDATE SET provider=EXCLUDED.provider,version=EXCLUDED.version,data=EXCLUDED.data,fetched_at=now()`,
    [id, userId, provider, version, dataJson],
  );
}

export function storeSourceFacts(db: Queryable, id: string, factsJson: string) {
  return db.query(
    "UPDATE item SET source_details=jsonb_set(COALESCE(source_details,'{}'::jsonb),'{source}',$2::jsonb) WHERE id=$1",
    [id, factsJson],
  );
}
