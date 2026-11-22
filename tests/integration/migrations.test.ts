import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDatabase } from '../../src/server/db';
import { migrate } from '../../src/server/db/migrations';

test('baseline and later files are atomic, ordered, and safe to retry', async () => {
  process.env.AM_TEST_DB = 'memory';
  const directory = await mkdtemp(join(tmpdir(), 'absolute-memory-migrations-'));
  const db = await createDatabase(undefined, false);
  try {
    await cp('db/migrations/0001_baseline', join(directory, '0001_baseline'), { recursive: true });
    const migration = join(directory, '0002_atomic.sql');
    await writeFile(
      migration,
      'CREATE TABLE migration_retry_test (id integer PRIMARY KEY); SELECT invalid_column;',
    );
    await assert.rejects(migrate(db, directory));
    assert.deepEqual((await db.query('SELECT version FROM schema_migration')).rows, [
      { version: '0001' },
    ]);
    assert.deepEqual(
      (await db.query("SELECT to_regclass('migration_retry_test') AS table_name")).rows,
      [{ table_name: null }],
    );
    await writeFile(migration, 'CREATE TABLE migration_retry_test (id integer PRIMARY KEY);');
    await Promise.all([migrate(db, directory), migrate(db, directory)]);
    assert.deepEqual(
      (await db.query('SELECT version FROM schema_migration ORDER BY version')).rows,
      [{ version: '0001' }, { version: '0002' }],
    );
    assert.deepEqual(
      (await db.query("SELECT extname FROM pg_extension WHERE extname='vector'")).rows,
      [{ extname: 'vector' }],
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
    await rm(directory, { recursive: true, force: true });
  }
});
