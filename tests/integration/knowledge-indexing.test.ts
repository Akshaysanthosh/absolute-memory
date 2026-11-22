import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/server/db';
import { migrate } from '../../src/server/db/migrations';
import { capture } from '../../src/server/services/library';
import { processKnowledge } from '../../src/server/jobs/knowledge-worker';

import { setTags, knowledgeInfo } from '../../src/server/services/knowledge/item-knowledge';
import { retrieve } from '../../src/server/services/knowledge/retrieval';
import { graphData } from '../../src/server/services/knowledge/graph';

import { fakeProvider } from '../fixtures/knowledge-provider';

test('knowledge migrations, queue recovery, ownership constraints, caching and invalidation', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await migrate(db);
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3),($4,$5,$6)', [
      'ka',
      'Alice',
      'ka@test.invalid',
      'kb',
      'Bob',
      'kb@test.invalid',
    ]);
    const a = (
      await capture(
        'ka',
        {
          kind: 'note',
          title: 'Processors',
          text: 'AMD processors are discussed in this saved research article.',
        },
        'web',
        db,
      )
    ).item;
    const b = (
      await capture(
        'kb',
        { kind: 'note', title: 'Private', text: 'Private unrelated content.' },
        'web',
        db,
      )
    ).item;
    assert.equal(
      (await db.query('SELECT * FROM knowledge_job WHERE item_id=$1', [a.id])).rows.length,
      1,
    );
    for (let i = 0; i < 4; i++) assert.equal(await processKnowledge(db, fakeProvider, 'ka'), true);
    assert.equal(
      (
        await db.query<{ state: string }>('SELECT state FROM knowledge_job WHERE item_id=$1', [
          a.id,
        ])
      ).rows[0].state,
      'ready',
    );
    assert.equal(await processKnowledge(db, fakeProvider, 'ka'), false);
    assert.equal(
      (await db.query('SELECT * FROM knowledge_chunk WHERE user_id=$1', ['kb'])).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO knowledge_chunk(id,user_id,item_id,ordinal,content_hash,content,passage_indices) VALUES($1,$2,$3,0,'x','x','{0}')",
        [randomUUID(), 'ka', b.id],
      ),
      /foreign key/,
    );
    await db.query('UPDATE item SET favorite=true WHERE id=$1', [a.id]);
    assert.equal(await processKnowledge(db, fakeProvider, 'ka'), false);
    await db.query("UPDATE item SET title='Updated' WHERE id=$1", [a.id]);
    assert.equal(
      (await db.query('SELECT * FROM knowledge_chunk WHERE item_id=$1', [a.id])).rows.length,
      0,
    );
    await processKnowledge(db, fakeProvider, 'ka');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const stale = processKnowledge(
      db,
      {
        ...fakeProvider,
        analyze: async (t) => {
          await gate;
          return fakeProvider.analyze(t);
        },
      },
      'ka',
    );
    await new Promise((r) => setTimeout(r, 100));
    await db.query("UPDATE item SET title='Newer' WHERE id=$1", [a.id]);
    release();
    await stale;
    assert.equal(
      (await db.query('SELECT * FROM knowledge_chunk WHERE item_id=$1', [a.id])).rows.length,
      0,
    );
    await db.query(
      "UPDATE knowledge_job SET state='running',locked_at=now()-interval '4 minutes' WHERE item_id=$1",
      [a.id],
    );
    await processKnowledge(db, fakeProvider, 'ka');
    assert.ok(
      (await db.query('SELECT * FROM knowledge_chunk WHERE item_id=$1', [a.id])).rows.length,
    );
    await db.query('DELETE FROM "user" WHERE id=$1', ['ka']);
    for (const t of [
      'knowledge_job',
      'knowledge_chunk',
      'knowledge_tag',
      'knowledge_entity',
      'knowledge_usage',
    ])
      assert.equal((await db.query(`SELECT * FROM ${t} WHERE user_id=$1`, ['ka'])).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('bounded retries, partial stages and failures preserve readability', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('retry','Retry','retry@test.invalid')",
    );
    const item = (
      await capture(
        'retry',
        {
          kind: 'note',
          title: 'Read now',
          text: 'AMD processors remain readable even if AI is unavailable.',
        },
        'web',
        db,
      )
    ).item;
    assert.equal(
      (
        await db.query<{ state: string }>('SELECT state FROM knowledge_job WHERE item_id=$1', [
          item.id,
        ])
      ).rows[0].state,
      'queued',
    );
    await db.query('UPDATE knowledge_job SET available_at=now() WHERE item_id=$1', [item.id]);
    await processKnowledge(db, fakeProvider, 'retry');
    await processKnowledge(db, fakeProvider, 'retry');
    let attempts = 0;
    const failing = {
      ...fakeProvider,
      embed: async () => {
        attempts++;
        throw new Error('transient');
      },
    };
    for (let i = 0; i < 3; i++) {
      await db.query('UPDATE knowledge_job SET available_at=now() WHERE item_id=$1', [item.id]);
      await processKnowledge(db, failing, 'retry');
    }
    assert.equal(attempts, 3);
    assert.equal((await knowledgeInfo('retry', item.id, db)).state, 'failed');
    assert.equal(
      (await db.query<{ status: string }>('SELECT status FROM item WHERE id=$1', [item.id])).rows[0]
        .status,
      'ready',
    );
    assert.ok(
      (
        await db.query<{ analysis: unknown }>(
          'SELECT analysis FROM knowledge_chunk WHERE item_id=$1',
          [item.id],
        )
      ).rows[0].analysis,
    );
  } finally {
    await db.close();
  }
});

test('every ready capture kind is organized and identical URLs remain tenant-scoped', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3),($4,$5,$6)', [
      'kinds-a',
      'Alice',
      'kinds-a@test.invalid',
      'kinds-b',
      'Bob',
      'kinds-b@test.invalid',
    ]);
    const ids: string[] = [];
    for (const [kind, user] of [
      ['article', 'kinds-a'],
      ['article', 'kinds-b'],
      ['pdf', 'kinds-a'],
      ['image', 'kinds-a'],
      ['note', 'kinds-a'],
    ]) {
      const id = randomUUID();
      ids.push(id);
      await db.query(
        "INSERT INTO item(id,user_id,kind,title,url,passages,status) VALUES($1,$2,$3,'Computing reference',$4,$5::jsonb,'ready')",
        [
          id,
          user,
          kind,
          kind === 'article' ? 'https://example.org/shared-source' : null,
          JSON.stringify([
            { index: 0, text: 'AMD processors are discussed in this saved computing reference.' },
          ]),
        ],
      );
    }
    let analyzed = 0;
    const provider = {
      ...fakeProvider,
      async analyze(text: string) {
        analyzed++;
        return fakeProvider.analyze(text);
      },
    };
    for (let step = 0; step < 30 && (await processKnowledge(db, provider)); step++);
    assert.equal(
      analyzed,
      5,
      'Identical source content must be processed within each owner, never a cross-tenant cache.',
    );
    assert.equal(
      (await db.query("SELECT item_id FROM knowledge_job WHERE state='ready'")).rows.length,
      5,
    );
    assert.equal((await db.query('SELECT DISTINCT id FROM knowledge_chunk')).rows.length, 5);
    await setTags('kinds-a', ids[0], ['alice-only'], db);
    assert.deepEqual((await knowledgeInfo('kinds-a', ids[0], db)).tags, ['alice-only']);
    assert.ok(!(await knowledgeInfo('kinds-b', ids[1], db)).tags.includes('alice-only'));
    const a = await graphData('kinds-a', undefined, db),
      b = await graphData('kinds-b', undefined, db);
    assert.ok(!a.nodes.some((n) => n.id === ids[1]));
    assert.ok(!b.nodes.some((n) => n.id === ids[0]));
    assert.ok(b.links.every((e) => e.itemId === ids[1]));
    const r = await retrieve('kinds-b', 'AMD processors', {}, db, fakeProvider);
    assert.ok(r.evidence.every((e) => e.itemId === ids[1]));
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
