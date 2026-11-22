import { HttpError } from './http';
import { getDatabase, type Database } from '@/server/db';
import { ownerId } from '@/server/repos/instance';

export async function isInstanceOwner(userId: string, database?: Database) {
  return (await ownerId(database ?? (await getDatabase()))) === userId;
}

export async function requireOwner(userId: string, database?: Database) {
  const db = database ?? (await getDatabase());
  if (!(await isInstanceOwner(userId, db)))
    throw new HttpError(403, 'Only the owner can manage this instance.');
  return db;
}
