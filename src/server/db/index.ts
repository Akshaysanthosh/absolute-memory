import { getConfig } from '@/server/config';
import { mkdir } from 'node:fs/promises';
import { migrate } from './migrations';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { Pool } from 'pg';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as liteDrizzle } from 'drizzle-orm/pglite';
import * as schema from '@/server/db/auth-schema';

export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  driver: 'postgres' | 'pglite';
  orm: ReturnType<typeof liteDrizzle<typeof schema>> | ReturnType<typeof pgDrizzle<typeof schema>>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
const state = globalThis as unknown as { amDb?: Promise<Database> };

export async function createDatabase(url?: string, migrateOnOpen = !url): Promise<Database> {
  const database = await openDatabase(url);
  try {
    if (migrateOnOpen) await migrate(database);
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

async function openDatabase(url?: string): Promise<Database> {
  if (url) {
    const pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      options: '-c timezone=UTC',
    });
    return {
      driver: 'postgres',
      orm: pgDrizzle(pool, { schema }),
      query: (sql, params) => pool.query(sql, params),
      close: () => pool.end(),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }
  const config = getConfig();
  if (config.AM_TEST_DB !== 'memory') await mkdir(config.DATA_DIR, { recursive: true });
  const lite = new PGlite({
    dataDir: config.AM_TEST_DB === 'memory' ? undefined : path.join(config.DATA_DIR, 'db'),
    extensions: { vector },
  });
  await lite.waitReady;
  const database: Database = {
    driver: 'pglite',
    orm: liteDrizzle(lite, { schema }),
    query: (sql, params) =>
      params
        ? lite.query(sql, params)
        : lite.exec(sql).then((r) => ({ rows: (r.at(-1)?.rows ?? []) as never[] })),
    transaction: (fn) =>
      lite.transaction((tx) =>
        fn({
          query: (sql, params) =>
            params
              ? tx.query(sql, params)
              : tx.exec(sql).then((r) => ({ rows: (r.at(-1)?.rows ?? []) as never[] })),
        }),
      ),
    close: () => lite.close(),
  };
  return database;
}
export function getDatabase(): Promise<Database> {
  if (!state.amDb) {
    const config = getConfig();
    state.amDb = createDatabase(config.DATABASE_URL, config.MIGRATE_ON_START).catch((error) => {
      delete state.amDb;
      throw error;
    });
  }
  return state.amDb;
}
