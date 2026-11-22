import { lockUser } from '@/server/repos/users';
import {
  deleteExpiredPairs,
  insertExtensionPair,
  lockPendingPair,
  redeemPair,
  deleteExpiredReceipts,
  insertCaptureReceipt,
  findReceiptStatus,
} from '@/server/repos/extension-connections';
import { insertCaptureToken, matchCaptureToken } from '@/server/repos/capture-tokens';
import { tokenHash } from '@/server/security/token-hash';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDatabase, type Database } from '@/server/db';
import { HttpError } from '@/server/auth/http';
export const pairSchema = z.object({ challenge: z.string().regex(/^[a-f0-9]{64}$/) });
export const exchangeSchema = z.object({ verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const receiptSchema = z.object({ receipt: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export async function approvePair(userId: string, challenge: string, database?: Database) {
  const db = database || (await getDatabase());
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);

    await deleteExpiredPairs(tx);
    const { rows } = await insertExtensionPair(tx, challenge, userId);
    if (!rows.length)
      throw new HttpError(
        409,
        'This connection request was already approved. Check the extension, or start a new connection.',
      );
  });
}
export async function exchangePair(
  verifier: string,
  database?: Database,
  connectionName = 'Chrome extension',
) {
  const db = database || (await getDatabase());
  return db.transaction(async (tx) => {
    const { rows } = await lockPendingPair(tx, tokenHash(verifier));
    const pair = rows[0];
    if (!pair) return { connected: false };
    // The proof never appears in a page URL. Retrying after a dropped response is
    // safe: the same proof produces the same scoped token, without creating more.
    const token = `am_ext_${verifier}`;
    if (pair.redeemed) {
      const existing = await matchCaptureToken(tx, pair.token_id, pair.user_id, tokenHash(token));
      if (!existing.rows.length)
        throw new HttpError(401, 'This connection was revoked. Start a new connection.');
    } else {
      const id = randomUUID();
      await insertCaptureToken(tx, {
        id,
        userId: pair.user_id,
        name: connectionName.slice(0, 80),
        hash: tokenHash(token),
      });
      await redeemPair(tx, tokenHash(verifier), id);
    }
    return { connected: true, token };
  });
}
export async function issueReceipt(tokenId: string, itemId: string, database?: Database) {
  const db = database || (await getDatabase()),
    receipt = randomBytes(32).toString('base64url');
  await db.transaction(async (tx) => {
    await deleteExpiredReceipts(tx);
    await insertCaptureReceipt(tx, tokenHash(receipt), tokenId, itemId);
  });
  return receipt;
}
export async function receiptStatus(
  tokenId: string,
  userId: string,
  receipt: string,
  database?: Database,
) {
  const db = database || (await getDatabase());
  const { rows } = await findReceiptStatus(db, tokenHash(receipt), tokenId, userId);
  if (!rows[0])
    throw new HttpError(
      404,
      'This save status has expired or is unavailable. Open your library to check the article.',
    );
  return rows[0];
}
export const extensionCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'no-store',
};
export function withExtensionCors(r: Response) {
  for (const [key, value] of Object.entries(extensionCors)) r.headers.set(key, value);
  return r;
}
