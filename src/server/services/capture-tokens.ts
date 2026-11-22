import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '@/server/db';
import {
  deleteCaptureToken,
  insertCaptureToken,
  listCaptureTokens,
} from '@/server/repos/capture-tokens';
import { tokenHash } from '@/server/security/token-hash';

export async function getCaptureTokens(userId: string) {
  return listCaptureTokens(await getDatabase(), userId);
}

export async function issueCaptureToken(userId: string, name: string) {
  const token = `am_ext_${randomBytes(32).toString('base64url')}`;
  await insertCaptureToken(await getDatabase(), {
    id: randomUUID(),
    userId,
    name,
    hash: tokenHash(token),
  });
  return token;
}

export async function revokeCaptureToken(userId: string, id: string) {
  await deleteCaptureToken(await getDatabase(), userId, id);
}
