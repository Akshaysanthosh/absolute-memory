import { randomUUID } from 'node:crypto';
import type { Queryable } from '@/server/db';

export async function listInvites(db: Queryable, userId: string) {
  return (
    await db.query<{ id: string; created_at: Date; expires_at: Date; used_at: Date | null }>(
      `SELECT id,created_at,expires_at,used_at FROM instance_invite
     WHERE created_by=$1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    )
  ).rows;
}

export async function createInvite(db: Queryable, userId: string, hash: string) {
  const {
    rows: [invite],
  } = await db.query<{ id: string; expires_at: Date }>(
    `INSERT INTO instance_invite(id,token_hash,created_by,expires_at)
     VALUES($1,$2,$3,now()+interval '24 hours') RETURNING id,expires_at`,
    [randomUUID(), hash, userId],
  );
  return invite;
}

export async function findInviteForUse(db: Queryable, hash: string, owner: string) {
  const {
    rows: [invite],
  } = await db.query<{ id: string }>(
    `SELECT id FROM instance_invite WHERE token_hash=$1 AND created_by=$2 AND used_at IS NULL AND expires_at>now()
     FOR UPDATE`,
    [hash, owner],
  );
  return invite;
}

export async function consumeInvite(db: Queryable, inviteId: string, userId: string) {
  await db.query('UPDATE instance_invite SET used_at=now(),used_by=$2 WHERE id=$1', [
    inviteId,
    userId,
  ]);
}

export async function revokeInvite(db: Queryable, userId: string, inviteId: string) {
  await db.query('DELETE FROM instance_invite WHERE created_by=$1 AND id=$2 AND used_at IS NULL', [
    userId,
    inviteId,
  ]);
}
