import { randomUUID } from 'node:crypto';
import type { Queryable } from '@/server/db';

export async function ownerId(db: Queryable, lock = false) {
  const {
    rows: [setting],
  } = await db.query<{ owner_user_id: string | null }>(
    'SELECT owner_user_id FROM instance_setting WHERE singleton' + (lock ? ' FOR UPDATE' : ''),
  );
  if (!setting) throw new Error('Instance settings are missing.');
  return setting.owner_user_id;
}

export async function setOwner(db: Queryable, userId: string) {
  await db.query('UPDATE instance_setting SET owner_user_id=$1 WHERE singleton', [userId]);
}

export async function createCredentialUser(
  db: Queryable,
  name: string,
  email: string,
  passwordHash: string,
): Promise<string | null> {
  const userId = randomUUID();
  const user = await db.query(
    'INSERT INTO "user"(id,name,email) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id',
    [userId, name, email],
  );
  if (!user.rows.length) return null;
  await db.query(
    "INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)",
    [randomUUID(), userId, passwordHash],
  );
  return userId;
}
