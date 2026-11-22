import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import { createHighlight } from '../../src/server/services/reading';
import { getHighlights } from '../../src/server/repos/reading';
import { validateSegments, type Passage } from '../../src/shared/passages';
import {
  ANALYSIS_CONCURRENCY,
  EMBEDDING_BATCH,
  processKnowledge,
} from '../../src/server/jobs/knowledge-worker';
import type { Analysis, KnowledgeProvider } from '../../src/server/providers/knowledge';

const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const paragraph =
  'AMD processors and memory hierarchies are compared across generations in this long saved article. ';
// Each section is one ~700-token paragraph with a distinct opening, so the chunker keeps one section per chunk.
const longText = (sections: number) =>
  Array.from({ length: sections }, (_, i) => `Part ${i}. ` + paragraph.repeat(28)).join('\n\n');

type Counters = {
  analyzed: string[];
  embedRequests: string[][];
  summaries: number;
  inflight: number;
  peak: number;
};
function countingProvider(
  counters: Counters,
  options: { failOnce?: (text: string) => boolean } = {},
): KnowledgeProvider {
  const failed = new Set<string>();
  return {
    async analyze(text) {
      counters.inflight++;
      counters.peak = Math.max(counters.peak, counters.inflight);
      try {
        await sleep(20);
        if (options.failOnce?.(text) && !failed.has(text)) {
          failed.add(text);
          throw new Error('transient provider error');
        }
        counters.analyzed.push(text);
        const value: Analysis = {
          summary: `Summary ${counters.analyzed.length}.`,
          tags: ['Computing', 'Chips'],
          entities: [{ name: 'AMD', type: 'company', evidence: text.slice(0, 20) }],
          relationships: [],
        };
        return { value, model: 'fake', inputTokens: 1, outputTokens: 1 };
      } finally {
        counters.inflight--;
      }
    },
    async embed(texts) {
      counters.embedRequests.push(texts);
      return {
        value: texts.map(() => vector),
        model: 'text-embedding-3-small',
        inputTokens: 1,
        outputTokens: 0,
      };
    },
    async summarize() {
      counters.summaries++;
      return { value: 'Overview.', model: 'fake', inputTokens: 1, outputTokens: 1 };
    },
  };
}
const fresh = (): Counters => ({
  analyzed: [],
  embedRequests: [],
  summaries: 0,
  inflight: 0,
  peak: 0,
});

test('organization analyzes sections in bounded parallel waves and embeds them in one request without touching passages', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('batch-a','A','batch-a@test.invalid'),('batch-b','B','batch-b@test.invalid')",
    );
    const item = (
      await capture(
        'batch-a',
        { kind: 'note', title: 'Long article', text: longText(7) },
        'web',
        db,
      )
    ).item;
    const other = (
      await capture('batch-b', { kind: 'note', title: 'Other owner', text: longText(2) }, 'web', db)
    ).item;
    const passagesBefore = (
      await db.query<{ passages: Passage[] }>('SELECT passages FROM item WHERE id=$1', [item.id])
    ).rows[0].passages;
    const passage = passagesBefore.find((p) => p.text.includes('AMD'))!;
    const quote = passage.text.slice(0, 40);
    const highlight = await createHighlight(
      'batch-a',
      item.id,
      [{ passageIndex: passage.index, start: 0, end: 40, text: quote }],
      db,
    );

    const counters = fresh();
    const provider = countingProvider(counters);
    let steps = 0;
    while (steps < 50 && (await processKnowledge(db, provider, 'batch-a'))) steps++;
    const chunks = (
      await db.query<{ content: string; ordinal: number }>(
        'SELECT content,ordinal FROM knowledge_chunk WHERE item_id=$1 AND analysis IS NOT NULL AND embedding IS NOT NULL ORDER BY ordinal',
        [item.id],
      )
    ).rows;
    assert.equal(chunks.length, 7, 'Every section is analyzed and embedded.');
    assert.equal(
      (
        await db.query<{ state: string }>('SELECT state FROM knowledge_job WHERE item_id=$1', [
          item.id,
        ])
      ).rows[0].state,
      'ready',
    );
    // chunks (1) + ceil(7/3) analysis waves (3) + one embedding request (1) + summary (1).
    assert.equal(steps, 1 + Math.ceil(7 / ANALYSIS_CONCURRENCY) + 1 + 1);
    assert.equal(
      counters.peak,
      ANALYSIS_CONCURRENCY,
      'Analysis runs in parallel but never above the concurrency bound.',
    );
    assert.deepEqual(
      counters.analyzed.toSorted(),
      chunks.map((c) => c.content).toSorted(),
      'Each section is analyzed exactly once.',
    );
    assert.equal(counters.embedRequests.length, 1);
    assert.deepEqual(
      counters.embedRequests[0],
      chunks.map((c) => c.content),
      'Embeddings are requested in section order in a single call.',
    );
    assert.ok(EMBEDDING_BATCH >= 7);
    assert.equal(counters.summaries, 1);
    const usage = (
      await db.query<{ feature: string; n: number }>(
        "SELECT feature,count(*)::int AS n FROM knowledge_usage WHERE user_id='batch-a' GROUP BY feature ORDER BY feature",
      )
    ).rows;
    assert.deepEqual(
      usage,
      [
        { feature: 'embedding', n: 1 },
        { feature: 'organization', n: 7 },
        { feature: 'summary', n: 1 },
      ],
      'Every provider request is still recorded.',
    );
    assert.ok(
      (
        await db.query(
          'SELECT 1 FROM knowledge_mention m JOIN knowledge_chunk c ON c.id=m.chunk_id WHERE c.item_id=$1',
          [item.id],
        )
      ).rows.length >= 7,
      'Entity evidence is stored for every section.',
    );

    // Organization reads source text but must never rewrite it: passages and highlight offsets stay valid.
    const passagesAfter = (
      await db.query<{ passages: Passage[] }>('SELECT passages FROM item WHERE id=$1', [item.id])
    ).rows[0].passages;
    assert.deepEqual(passagesAfter, passagesBefore);
    const [stored] = await getHighlights(db, 'batch-a', { itemId: item.id, limit: 1, offset: 0 });
    assert.equal(stored.id, highlight.id);
    assert.equal(stored.quote, quote);
    assert.ok(validateSegments(passagesAfter, stored.segments));

    // Another owner's queued work is untouched by an owner-scoped batch.
    assert.equal(
      (
        await db.query(
          'SELECT 1 FROM knowledge_chunk WHERE item_id=$1 AND (analysis IS NOT NULL OR embedding IS NOT NULL)',
          [other.id],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ state: string }>('SELECT state FROM knowledge_job WHERE item_id=$1', [
          other.id,
        ])
      ).rows[0].state,
      'queued',
    );
  } finally {
    await db.close();
  }
});

test("a failed section keeps its siblings' paid analyses and only the failed section is retried", async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('batch-retry','R','batch-retry@test.invalid')",
    );
    const item = (
      await capture(
        'batch-retry',
        { kind: 'note', title: 'Partial failure', text: longText(3) },
        'web',
        db,
      )
    ).item;
    const counters = fresh();
    const provider = countingProvider(counters, { failOnce: (text) => text.startsWith('Part 1.') });
    assert.equal(await processKnowledge(db, provider, 'batch-retry'), true); // chunks
    assert.equal(await processKnowledge(db, provider, 'batch-retry'), true); // first wave: one of three fails
    const job = (
      await db.query<{ state: string; error: string; lease: string | null; attempts: number }>(
        'SELECT state,error,lease,attempts FROM knowledge_job WHERE item_id=$1',
        [item.id],
      )
    ).rows[0];
    assert.equal(job.state, 'queued');
    assert.equal(job.lease, null);
    assert.match(job.error, /retry/);
    assert.equal(
      (
        await db.query('SELECT 1 FROM knowledge_chunk WHERE item_id=$1 AND analysis IS NOT NULL', [
          item.id,
        ])
      ).rows.length,
      2,
      'Successful sections are committed despite the sibling failure.',
    );
    const failedUsage = (
      await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM knowledge_usage WHERE user_id='batch-retry' AND error IS NOT NULL",
      )
    ).rows[0].n;
    assert.equal(failedUsage, 1, 'The failed (possibly billed) attempt is recorded.');
    await db.query('UPDATE knowledge_job SET available_at=now() WHERE item_id=$1', [item.id]);
    let steps = 0;
    while (steps < 20 && (await processKnowledge(db, provider, 'batch-retry'))) steps++;
    assert.equal(
      (
        await db.query<{ state: string }>('SELECT state FROM knowledge_job WHERE item_id=$1', [
          item.id,
        ])
      ).rows[0].state,
      'ready',
    );
    assert.equal(
      counters.analyzed.length,
      3,
      'Each section has exactly one successful analysis; finished sections are not re-requested.',
    );
    assert.equal(new Set(counters.analyzed).size, 3);
  } finally {
    await db.close();
  }
});

test('an edit during a parallel wave discards the stale results instead of attaching them to new text', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('batch-stale','S','batch-stale@test.invalid')",
    );
    const item = (
      await capture('batch-stale', { kind: 'note', title: 'Stale', text: longText(3) }, 'web', db)
    ).item;
    const counters = fresh();
    const provider = countingProvider(counters);
    await processKnowledge(db, provider, 'batch-stale'); // chunks
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: KnowledgeProvider = {
      ...provider,
      analyze: async (t) => {
        await gate;
        return provider.analyze(t);
      },
    };
    const stale = processKnowledge(db, slow, 'batch-stale');
    await sleep(50);
    await db.query("UPDATE item SET title='Edited while organizing' WHERE id=$1", [item.id]);
    release();
    await stale;
    assert.equal(
      (await db.query('SELECT 1 FROM knowledge_chunk WHERE item_id=$1', [item.id])).rows.length,
      0,
      'The edit invalidated old sections; stale analyses were not written.',
    );
    assert.equal(
      (
        await db.query<{ stage: string; state: string }>(
          'SELECT stage,state FROM knowledge_job WHERE item_id=$1',
          [item.id],
        )
      ).rows[0].stage,
      'chunks',
    );
  } finally {
    await db.close();
  }
});
