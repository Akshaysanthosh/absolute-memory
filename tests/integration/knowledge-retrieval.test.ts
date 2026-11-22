import type { KnowledgeProvider } from '../../src/server/providers/knowledge';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/server/db';

import { capture } from '../../src/server/services/library';
import { processKnowledge } from '../../src/server/jobs/knowledge-worker';

import {
  setTags,
  knowledgeInfo,
  related,
} from '../../src/server/services/knowledge/item-knowledge';
import { retrieve } from '../../src/server/services/knowledge/retrieval';
import { graphData } from '../../src/server/services/knowledge/graph';
import { sourceAvailability } from '../../src/server/services/knowledge/citations';
import { reserveLibraryTurn } from '../../src/server/services/knowledge/actions';

import { validateCitations, type SavedSource } from '../../src/shared/knowledge/shared';

import { fakeProvider, vector } from '../fixtures/knowledge-provider';

test('tags, hybrid search, graph evidence and related items stay inside the account; edits survive reprocessing', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3),($4,$5,$6)', [
      'search-a',
      'Alice',
      'search-a@test.invalid',
      'search-b',
      'Bob',
      'search-b@test.invalid',
    ]);
    const text =
      'AMD develops processors. NVIDIA develops processors. These processors are compared.';
    const make = async (user: string, title: string) =>
      (await capture(user, { kind: 'note', title, text }, 'web', db)).item;
    const a = await make('search-a', 'AMD computing'),
      a2 = await make('search-a', 'Chip comparison'),
      b = await make('search-b', 'Secret processors');
    const graphProvider: KnowledgeProvider = {
      ...fakeProvider,
      analyze: async (text) => ({
        ...(await fakeProvider.analyze(text)),
        value: {
          summary: 'Processor comparison',
          tags: ['Computing', 'Chips', 'Research'],
          entities: [
            { name: 'AMD', type: 'company', evidence: 'AMD develops processors.' },
            { name: 'NVIDIA', type: 'company', evidence: 'NVIDIA develops processors.' },
            { name: 'Invented', type: 'thing', evidence: 'Evidence does not exist' },
          ],
          relationships: [
            {
              source: 'AMD',
              target: 'NVIDIA',
              label: 'compared with',
              evidence: 'These processors are compared.',
            },
            { source: 'AMD', target: 'Invented', label: 'fake', evidence: 'Not supported' },
          ],
        },
      }),
    };
    for (const u of ['search-a', 'search-b'])
      while (await processKnowledge(db, graphProvider, u)) {}
    await setTags('search-a', a.id, ['custom', 'chips'], db);
    assert.deepEqual((await knowledgeInfo('search-a', a.id, db)).tags, ['chips', 'custom']);
    await assert.rejects(setTags('search-b', a.id, ['stolen'], db), /not found/);
    const result = await retrieve('search-a', 'processors', {}, db, fakeProvider);
    assert.equal(result.evidence.length, 2);
    assert.ok(result.evidence.every((e) => e.itemId !== b.id));
    for (const e of result.evidence) {
      const item = e.itemId === a.id ? a : a2;
      assert.equal(item.passages[e.passageIndex].text.trim(), e.text.trim());
    }
    // A paraphrase with no literal match still finds a semantic neighbor.
    assert.ok(
      (await retrieve('search-a', 'silicon computation', {}, db, fakeProvider)).evidence.length,
    );
    const degraded = await retrieve('search-a', 'processors', {}, db, {
      ...fakeProvider,
      embed: async () => {
        throw new Error('offline');
      },
    });
    assert.equal(degraded.degraded, true);
    assert.ok(degraded.evidence.length);
    assert.equal(
      (
        await retrieve('search-a', 'unfindable mystery', {}, db, {
          ...fakeProvider,
          embed: async () => {
            throw new Error('offline');
          },
        })
      ).evidence.length,
      0,
    );
    assert.equal(
      (await retrieve('search-a', 'processors', { tags: ['custom'] }, db, fakeProvider)).evidence[0]
        .itemId,
      a.id,
    );
    const scopedOffline = await retrieve(
      'search-a',
      'Summarize the broader themes',
      { tags: ['custom'] },
      db,
      {
        ...fakeProvider,
        embed: async () => {
          throw new Error('offline');
        },
      },
    );
    assert.deepEqual(
      scopedOffline.evidence.map((e) => e.itemId),
      [a.id],
    );
    assert.equal(
      (
        await retrieve('search-a', 'Summarize themes', { tags: ['nonexistent'] }, db, {
          ...fakeProvider,
          embed: async () => {
            throw new Error('offline');
          },
        })
      ).evidence.length,
      0,
    );
    await db.query('UPDATE item SET origin_turn_id=$2 WHERE id=$1', [
      a.id,
      'abc00000-0000-4000-8000-000000000001',
    ]);
    const topicNotesOnly = await retrieve(
      'search-a',
      'Summarize themes',
      { tags: ['custom'], excludeChatNotes: true },
      db,
      {
        ...fakeProvider,
        embed: async () => {
          throw new Error('offline');
        },
      },
    );
    assert.deepEqual(topicNotesOnly.evidence, []);

    await assert.rejects(
      retrieve('search-a', 'processors', { itemIds: [b.id] }, db, fakeProvider),
      /not found/,
    );
    const graph = await graphData('search-a', undefined, db);
    assert.ok(!graph.nodes.some((n) => n.name === 'Secret processors' || n.name === 'invented'));
    assert.equal(graph.nodes.filter((n) => n.kind === 'concept').length, 2);
    assert.ok(graph.links.some((l) => l.label === 'compared with'));
    assert.ok(graph.links.every((l) => l.itemId !== b.id));
    let sourceReads = 0;
    const measured = {
      ...db,
      async query<T extends Record<string, unknown>>(sql: string, params?: unknown[]) {
        const result = await db.query<T>(sql, params);
        for (const row of result.rows)
          if (Array.isArray(row.passages) && row.passages.length) sourceReads++;
        return result;
      },
    };
    assert.deepEqual(await graphData('search-a', undefined, measured), graph);
    assert.equal(sourceReads, 0, 'Graph reads citation indices without transferring full passages');
    const compact = await graphData('search-a', undefined, measured, { compact: true });
    assert.deepEqual(compact.nodes, graph.nodes);
    assert.deepEqual(
      compact.links.map(({ id, source, target, label, itemId }) => ({
        id,
        source,
        target,
        label,
        itemId,
      })),
      graph.links.map(({ id, source, target, label, itemId }) => ({
        id,
        source,
        target,
        label,
        itemId,
      })),
    );
    assert.ok(compact.links.every((l) => !('evidence' in l) && !('passageIndex' in l)));
    assert.equal(sourceReads, 0);
    const detail = await graphData('search-a', undefined, db, { nodeId: a.id });
    assert.deepEqual(
      detail.links,
      graph.links.filter((l) => l.source === a.id || l.target === a.id),
    );
    assert.equal((await graphData('search-b', undefined, db, { nodeId: a.id })).links.length, 0);
    const concept = graph.nodes.find((n) => n.kind === 'concept')!;
    const conceptDetail = await graphData('search-a', undefined, db, { nodeId: concept.id });
    assert.deepEqual(
      conceptDetail.links,
      graph.links.filter((l) => l.source === concept.id || l.target === concept.id),
    );
    const mention = (
      await db.query<{ entity_id: string; chunk_id: string; evidence: string }>(
        "SELECT entity_id,chunk_id,evidence FROM knowledge_mention WHERE user_id='search-a' LIMIT 1",
      )
    ).rows[0];
    await db.query('UPDATE knowledge_mention SET evidence=$3 WHERE entity_id=$1 AND chunk_id=$2', [
      mention.entity_id,
      mention.chunk_id,
      'AMD',
    ]);
    const updated = await graphData('search-a', undefined, measured);
    assert.equal(sourceReads, 0);
    const changed = updated.links.find((l) => l.id === `${mention.entity_id}:${mention.chunk_id}`)!;
    const source = changed.itemId === a.id ? a : a2;
    assert.equal(changed.evidence, 'AMD');
    assert.ok(source.passages[changed.passageIndex!].text.includes('AMD'));
    await db.query('UPDATE knowledge_mention SET evidence=$3 WHERE entity_id=$1 AND chunk_id=$2', [
      mention.entity_id,
      mention.chunk_id,
      mention.evidence,
    ]);
    const reads = await related('search-a', a.id, db);
    assert.equal(reads.length, 1);
    assert.equal(reads[0].itemId, a2.id);
    await db.query('UPDATE item SET archived=true WHERE id=$1', [a2.id]);
    assert.equal((await related('search-a', a.id, db)).length, 0);
    await db.query("UPDATE item SET title='Updated source' WHERE id=$1", [a.id]);
    while (await processKnowledge(db, graphProvider, 'search-a')) {}
    const tags = (await knowledgeInfo('search-a', a.id, db)).tags;
    assert.ok(tags.includes('custom'));
    assert.ok(!tags.includes('computing'), 'dismissal persists');
    await db.query('DELETE FROM item WHERE user_id=$1', ['search-a']);
    assert.equal((await graphData('search-a', undefined, db)).nodes.length, 0);
    assert.equal(
      (await db.query("SELECT * FROM knowledge_entity WHERE user_id='search-a'")).rows.length,
      0,
    );
    assert.ok((await graphData('search-b', undefined, db)).nodes.length);
  } finally {
    await db.close();
  }
});

test('library reservations enforce ownership and citations reflect source revisions', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('chat-a','A','chat-a@test.invalid'),('chat-b','B','chat-b@test.invalid')",
    );
    const item = (
      await capture(
        'chat-a',
        { kind: 'note', title: 'Study', text: 'The processor executes instructions.' },
        'web',
        db,
      )
    ).item;
    await processKnowledge(db, fakeProvider, 'chat-a');
    const passageIndex = item.passages[0].index;
    const source: SavedSource = {
      type: 'saved',
      key: '1',
      itemId: item.id,
      title: item.title,
      passageIndex,
      quote: item.passages[0].text,
    };
    assert.equal(
      ((await sourceAvailability('chat-a', [source], db))[0] as SavedSource).available,
      true,
    );
    assert.equal(
      validateCitations('Valid [1], invented [99]', [source]),
      'Valid [1], invented [source unavailable]',
    );
    await db.query('UPDATE item SET passages=$2::jsonb WHERE id=$1', [
      item.id,
      JSON.stringify([{ ...item.passages[0], text: 'A different text of a similar length.' }]),
    ]);
    assert.equal(
      ((await sourceAvailability('chat-a', [source], db))[0] as SavedSource).available,
      false,
    );
    const first = await reserveLibraryTurn(
      'chat-a',
      { requestId: randomUUID(), question: 'Explain', web: false },
      'fake',
      db,
    );
    await assert.rejects(
      reserveLibraryTurn(
        'chat-b',
        { threadId: first.threadId, requestId: randomUUID(), question: 'Steal', web: false },
        'fake',
        db,
      ),
      /not found/,
    );
    await assert.rejects(
      reserveLibraryTurn(
        'chat-a',
        { requestId: randomUUID(), question: 'Concurrent', web: false },
        'fake',
        db,
      ),
      /already running/,
    );
    await db.query('DELETE FROM "user" WHERE id=\'chat-a\'');
    assert.equal((await db.query('SELECT * FROM library_turn')).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('retrieval bounds evidence to twelve passages and three per item', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('bounds','Bounds','bounds@test.invalid')",
    );
    for (let n = 0; n < 5; n++) {
      const item = (
        await capture(
          'bounds',
          { kind: 'note', title: `Processor ${n}`, text: 'Processor reference.' },
          'web',
          db,
        )
      ).item;
      for (let ordinal = 0; ordinal < 6; ordinal++)
        await db.query(
          'INSERT INTO knowledge_chunk(id,user_id,item_id,ordinal,content_hash,content,passage_indices,embedding,analysis) VALUES($1,$2,$3,$4,$5,$6,$7::integer[],$8::vector,$9::jsonb)',
          [
            randomUUID(),
            'bounds',
            item.id,
            ordinal,
            String(ordinal),
            'Processor reference.',
            [0],
            JSON.stringify(vector),
            JSON.stringify({ summary: 'Processor', tags: [], entities: [], relationships: [] }),
          ],
        );
      await db.query("UPDATE knowledge_job SET state='ready' WHERE item_id=$1", [item.id]);
    }
    const result = await retrieve('bounds', 'Processor', {}, db, fakeProvider);
    assert.equal(result.evidence.length, 12);
    for (const id of new Set(result.evidence.map((e) => e.itemId)))
      assert.ok(result.evidence.filter((e) => e.itemId === id).length <= 3);
  } finally {
    await db.close();
  }
});
