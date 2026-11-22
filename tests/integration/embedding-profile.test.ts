import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../../src/server/db';
import { runKnowledgeBatch } from '../../src/server/jobs/knowledge-worker';
import { embeddingAvailability, reembed } from '../../src/server/services/embeddings';
import { retrieve } from '../../src/server/services/knowledge/retrieval';
import { capture } from '../../src/server/services/library';
import { listLibraryPage } from '../../src/server/services/library-search';
import { startMockProvider } from '../fixtures/mock-provider/server';

test('PGlite keeps keyword search available across provider changes and rebuilds embeddings', async (t) => {
  const fixture = await startMockProvider();
  t.after(fixture.close);
  const keys = [
    'AM_TEST_DB',
    'AI_BASE_URL',
    'AI_MODEL',
    'EMBEDDINGS_BASE_URL',
    'EMBEDDINGS_MODEL',
    'EMBEDDINGS_DIMENSIONS',
  ] as const;
  const original = keys.map((key) => process.env[key]);
  for (const key of keys) delete process.env[key];
  t.after(() =>
    keys.forEach((key, i) => {
      if (original[i] === undefined) delete process.env[key];
      else process.env[key] = original[i];
    }),
  );
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  t.after(() => db.close());
  await db.query(
    `INSERT INTO "user"(id,name,email) VALUES('owner','Owner','owner@example.invalid')`,
  );
  const { item } = await capture(
    'owner',
    { kind: 'note', title: 'A processor', text: 'This research compares processor architectures.' },
    'web',
    db,
  );
  await runKnowledgeBatch('owner', db);
  const state = async () =>
    (
      await db.query<{ state: string }>('SELECT state FROM knowledge_job WHERE item_id=$1', [
        item.id,
      ])
    ).rows[0]?.state;
  const dimensions = async () =>
    (
      await db.query<{ n: number }>(
        'SELECT vector_dims(embedding) AS n FROM knowledge_chunk WHERE item_id=$1',
        [item.id],
      )
    ).rows[0]?.n;
  const lookup = () => retrieve('owner', 'processor', {}, db);
  assert.equal(await state(), 'skipped');
  assert.equal((await lookup()).evidence[0]?.itemId, item.id);
  assert.deepEqual(fixture.calls, []);

  process.env.EMBEDDINGS_BASE_URL = fixture.baseURL;
  process.env.EMBEDDINGS_MODEL = 'fixture-original';
  await runKnowledgeBatch('owner', db);
  assert.equal(await state(), 'ready');
  assert.equal(await dimensions(), 8);
  assert.equal((await embeddingAvailability(db)).dimensions, 8);
  await db.query(
    `INSERT INTO "user"(id,name,email) VALUES('other','Other','other@example.invalid')`,
  );
  const privateItem = await capture(
    'other',
    { kind: 'note', title: 'Private processor', text: 'Private processor architectures.' },
    'web',
    db,
  );
  await runKnowledgeBatch('other', db);
  const semantic = await listLibraryPage('owner', db, {
    query: 'silicon',
    type: 'Note',
    status: 'ready',
  });
  assert.deepEqual(
    semantic.items.map((result) => result.id),
    [item.id],
  );
  assert.ok(semantic.items.every((result) => result.id !== privateItem.item.id));
  assert.equal(
    (await listLibraryPage('owner', db, { query: 'silicon', semantic: false })).items.length,
    0,
  );
  await db.query(`UPDATE item SET created_at='2025-10-01T12:00:00Z' WHERE id=$1`, [item.id]);
  await db.query(
    `INSERT INTO knowledge_tag(user_id,item_id,name,origin) VALUES('owner',$1,'engineering','manual')`,
    [item.id],
  );
  const scoped = {
    query: 'processor',
    tag: 'engineering',
    status: 'ready',
    after: '2025-10-01',
    before: '2025-10-02',
  } as const;
  assert.deepEqual(
    (await listLibraryPage('owner', db, scoped)).items.map((result) => result.id),
    [item.id],
  );
  for (const filter of [
    { tag: 'unmatched' },
    { after: '2025-10-02' },
    { status: 'pending' },
  ] as const) {
    assert.equal((await listLibraryPage('owner', db, { ...scoped, ...filter })).items.length, 0);
  }

  const semanticOnly = await capture(
    'owner',
    { kind: 'note', title: 'Other research', text: 'Electronic hardware documentation.' },
    'web',
    db,
  );
  await runKnowledgeBatch('owner', db);
  const first = await listLibraryPage('owner', db, { query: 'processor', limit: 1 });
  assert.equal(first.items[0]?.id, item.id);
  assert.ok(first.nextCursor);
  const second = await listLibraryPage('owner', db, {
    query: 'processor',
    limit: 1,
    cursor: first.nextCursor!,
  });
  assert.equal(second.items[0]?.id, semanticOnly.item.id);

  process.env.EMBEDDINGS_MODEL = 'fixture-changed';
  process.env.EMBEDDINGS_DIMENSIONS = '12';
  const calls = fixture.calls.length;
  assert.equal((await embeddingAvailability(db)).mismatch, true);
  assert.equal((await lookup()).evidence[0]?.itemId, item.id);
  assert.equal((await listLibraryPage('owner', db, { query: 'processor' })).items[0]?.id, item.id);
  assert.equal(fixture.calls.length, calls);
  assert.deepEqual(await reembed(db), { model: 'fixture-changed', dimensions: 12 });
  assert.equal(await state(), 'queued');
  assert.equal(await dimensions(), null);
  await runKnowledgeBatch('owner', db);
  assert.equal(await state(), 'ready');
  assert.equal(await dimensions(), 12);
  assert.equal((await embeddingAvailability(db)).mismatch, false);
  assert.equal((await lookup()).evidence[0]?.itemId, item.id);
});
