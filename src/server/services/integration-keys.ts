import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '@/server/auth/http';
import { getDatabase, type Database } from '@/server/db';
import {
  countTokens,
  deleteExpiredTokens,
  deleteIntegrationToken,
  insertIntegrationToken,
  listActiveTokens,
  scopes,
} from '@/server/repos/integration-tokens';
import { lockUser } from '@/server/repos/users';
import { tokenHash } from '@/server/security/token-hash';
import { API_KEY_LIFETIME_DAYS, API_KEYS_PER_ACCOUNT } from '@/shared/input-limits';

export const integrationKeySchema = z
  .strictObject({
    label: z.string().trim().min(1).max(80),
    expiresInDays: z.number().int().min(1).max(3650).optional(),
    noExpiry: z.literal(true).optional(),
    scopes: z
      .array(z.enum(scopes))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length),
  })
  .refine((input) => !input.noExpiry || input.expiresInDays === undefined, {
    message: 'Choose an expiry or explicitly select no expiry.',
  });

export async function listIntegrationKeys(userId: string, db?: Database) {
  return listActiveTokens(db ?? (await getDatabase()), userId);
}

export async function createIntegrationKey(
  userId: string,
  input: z.infer<typeof integrationKeySchema>,
  db?: Database,
) {
  const token = 'am_' + randomBytes(32).toString('base64url');
  const key = await (db ?? (await getDatabase())).transaction(async (tx) => {
    await lockUser(tx, userId);
    await deleteExpiredTokens(tx, userId);
    if ((await countTokens(tx, userId)) >= API_KEYS_PER_ACCOUNT)
      throw new HttpError(429, 'Revoke a personal key before creating another.');
    return insertIntegrationToken(tx, {
      id: randomUUID(),
      userId,
      label: input.label,
      hash: tokenHash(token),
      scopes: input.scopes,
      expiresInDays: input.noExpiry ? null : (input.expiresInDays ?? API_KEY_LIFETIME_DAYS),
    });
  });
  return { key, token };
}

export async function revokeIntegrationKey(userId: string, id: string, db?: Database) {
  const deleted = await deleteIntegrationToken(db ?? (await getDatabase()), userId, id);
  if (!deleted) throw new HttpError(404, 'This personal key was not found.');
}
