import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashPassword } from 'better-auth/crypto';
import { requireOwner } from '@/server/auth/owner';
import { HttpError } from '@/server/auth/http';
import { getConfig } from '@/server/config';
import { getDatabase, type Database } from '@/server/db';
import { createCredentialUser, ownerId, setOwner } from '@/server/repos/instance';
import {
  consumeInvite,
  createInvite,
  findInviteForUse,
  listInvites,
  revokeInvite,
} from '@/server/repos/invites';
import { tokenHash } from '@/server/security/token-hash';
import { seedNewAccount } from '@/server/services/samples/seed';

export const setupInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(10).max(128),
  invite: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
});

export async function instanceOwner() {
  return ownerId(await getDatabase());
}

export async function createInstanceAccount(
  input: z.infer<typeof setupInput>,
  database?: Database,
) {
  const db = database ?? (await getDatabase());
  const hash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const owner = await ownerId(tx, true);
    if (owner && !input.invite) throw new HttpError(409, 'This instance already has an owner.');
    if (!owner && input.invite) throw new HttpError(400, 'Finish instance setup first.');
    const invite =
      owner && input.invite
        ? await findInviteForUse(tx, tokenHash(input.invite), owner)
        : undefined;
    if (owner && !invite)
      throw new HttpError(400, 'This invite is invalid, expired, or already used.');

    const id = await createCredentialUser(tx, input.name, input.email, hash);
    if (!id) throw new HttpError(409, 'An account is already using that email.');
    if (!owner) await setOwner(tx, id);
    if (invite) await consumeInvite(tx, invite.id, id);
    await seedNewAccount({ transaction: (run) => run(tx) }, id);
    return { id };
  });
}

export async function listInstanceInvites(userId: string) {
  return listInvites(await requireOwner(userId), userId);
}

export async function createInstanceInvite(userId: string) {
  const db = await requireOwner(userId);
  const token = randomBytes(32).toString('base64url');
  const invite = await createInvite(db, userId, tokenHash(token));
  const url = new URL('/setup?mode=invite', getConfig().APP_URL);
  url.hash = new URLSearchParams({ token }).toString();
  return { ...invite, url: url.href };
}

export async function revokeInstanceInvite(userId: string, inviteId: string) {
  await revokeInvite(await requireOwner(userId), userId, inviteId);
}
