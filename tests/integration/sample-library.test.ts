import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import {
  addSampleLinks,
  removeSamples,
  seedNewAccount,
} from '../../src/server/services/samples/seed';

test('a new library receives one original welcome note and can remove it independently', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    for (const id of ['ada', 'grace']) {
      await db.query('INSERT INTO "user"(id, name, email) VALUES($1, $1, $2)', [
        id,
        id + '@example.test',
      ]);
    }
    await Promise.all([
      seedNewAccount(db, 'ada'),
      seedNewAccount(db, 'ada'),
      seedNewAccount(db, 'grace'),
    ]);
    const { rows } = await db.query(
      'SELECT user_id, kind, sample_key, status FROM item ORDER BY user_id',
    );
    assert.deepEqual(rows, [
      { user_id: 'ada', kind: 'note', sample_key: 'welcome', status: 'ready' },
      { user_id: 'grace', kind: 'note', sample_key: 'welcome', status: 'ready' },
    ]);
    assert.equal((await db.query('SELECT id FROM import_job')).rows.length, 0);
    const own = await capture(
      'ada',
      { kind: 'note', title: 'My own note', text: 'Keep this.' },
      'web',
      db,
    );
    assert.equal(await removeSamples('ada', db), 1);
    await seedNewAccount(db, 'ada');
    assert.deepEqual((await db.query('SELECT id FROM item WHERE user_id=$1', ['ada'])).rows, [
      { id: own.item.id },
    ]);
    assert.equal(
      (await db.query('SELECT id FROM item WHERE user_id=$1', ['grace'])).rows.length,
      1,
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('sample links use the normal queue, deduplicate and remove only sample items', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('sample-owner','Owner','sample-owner@example.test')`,
    );
    await seedNewAccount(db, 'sample-owner');
    const own = await capture(
      'sample-owner',
      { kind: 'article', url: 'https://paulgraham.com/greatwork.html' },
      'web',
      db,
    );
    const added = await addSampleLinks('sample-owner', db);
    assert.ok(added > 0);
    assert.equal(await addSampleLinks('sample-owner', db), 0);
    const { rows } = await db.query<{
      count: number;
    }>(`SELECT count(*)::int AS count FROM item i JOIN import_job j ON j.item_id=i.id
      WHERE i.user_id='sample-owner' AND i.sample_key IS NOT NULL AND j.state='queued'`);
    assert.equal(rows[0].count, added);
    assert.equal(await removeSamples('sample-owner', db), added + 1);
    assert.deepEqual(
      (await db.query('SELECT id FROM item WHERE user_id=$1', ['sample-owner'])).rows,
      [{ id: own.item.id }],
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
