import type { Queryable } from '@/server/db';

export function deleteExpiredPairs(db: Queryable) {
  return db.query('DELETE FROM extension_pair WHERE expires_at<now()');
}

export function insertExtensionPair(db: Queryable, challenge: string, userId: string) {
  return db.query(
    'INSERT INTO extension_pair(challenge,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING challenge',
    [challenge, userId],
  );
}

export function lockPendingPair(db: Queryable, challenge: string) {
  return db.query<{
    user_id: string;
    redeemed: boolean;
    token_id: string | null;
  }>(
    'SELECT user_id,redeemed,token_id FROM extension_pair WHERE challenge=$1 AND expires_at>now() FOR UPDATE',
    [challenge],
  );
}

export function redeemPair(db: Queryable, challenge: string, tokenId: string) {
  return db.query('UPDATE extension_pair SET redeemed=true,token_id=$2 WHERE challenge=$1', [
    challenge,
    tokenId,
  ]);
}

export function deleteExpiredReceipts(db: Queryable) {
  return db.query('DELETE FROM capture_receipt WHERE expires_at<now()');
}

export function insertCaptureReceipt(db: Queryable, hash: string, tokenId: string, itemId: string) {
  return db.query('INSERT INTO capture_receipt(hash,token_id,item_id) VALUES($1,$2,$3)', [
    hash,
    tokenId,
    itemId,
  ]);
}

export function findReceiptStatus(db: Queryable, hash: string, tokenId: string, userId: string) {
  return db.query<{ id: string; status: string; error: string | null }>(
    `SELECT i.id,i.status,i.error FROM capture_receipt r JOIN item i ON i.id=r.item_id JOIN capture_token t ON t.id=r.token_id
 WHERE r.hash=$1 AND r.token_id=$2 AND i.user_id=$3 AND t.user_id=$3 AND r.expires_at>now()`,
    [hash, tokenId, userId],
  );
}
