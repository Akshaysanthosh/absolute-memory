import type { Item } from '@/shared/types';
import type { Queryable } from '@/server/db';
import type { KeyIdentity } from '@/server/repos/integration-tokens';

export async function insertIntegrationSave(db: Queryable, key: KeyIdentity, itemId: string) {
  await db.query(
    `INSERT INTO integration_save(token_id,user_id,item_id) VALUES($1,$2,$3)
    ON CONFLICT(token_id,item_id) DO NOTHING`,
    [key.id, key.user_id, itemId],
  );
}

export function findIntegrationRequest(
  db: Queryable,
  tokenId: string,
  userId: string,
  requestHash: string,
) {
  return db.query<{ item_id: string; input_hash: string }>(
    'SELECT item_id,input_hash FROM integration_save WHERE token_id=$1 AND user_id=$2 AND request_hash=$3',
    [tokenId, userId, requestHash],
  );
}

export function storeIntegrationRequest(
  db: Queryable,
  tokenId: string,
  userId: string,
  itemId: string,
  requestHash: string,
  inputHash: string,
) {
  return db.query(
    'INSERT INTO integration_save(token_id,user_id,item_id,request_hash,input_hash) VALUES($1,$2,$3,$4,$5)',
    [tokenId, userId, itemId, requestHash, inputHash],
  );
}

export function findIntegrationSave(
  db: Queryable,
  tokenId: string,
  userId: string,
  itemId: string,
) {
  return db.query<{ id: string; status: Item['status'] }>(
    `SELECT i.id,i.status FROM integration_save s JOIN item i ON i.id=s.item_id AND i.user_id=s.user_id
     WHERE s.token_id=$1 AND s.user_id=$2 AND i.id=$3`,
    [tokenId, userId, itemId],
  );
}
