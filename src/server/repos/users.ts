import type { Queryable } from '@/server/db';

export async function lockUser(tx: Queryable, userId: string) {
  await tx.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [userId]);
}

export function findUserByEmail(db: Queryable, email: string) {
  return db.query<{ id: string }>('SELECT id FROM "user" WHERE email=$1', [email]);
}
