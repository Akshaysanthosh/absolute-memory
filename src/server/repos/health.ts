import type { Queryable } from '@/server/db';

export function listInstalledMigrations(db: Queryable) {
  return db.query<{ version: string }>('SELECT version FROM schema_migration');
}

export function testVectorSupport(db: Queryable) {
  return db.query<{ dimensions: number }>("SELECT vector_dims('[1]'::vector) AS dimensions");
}
