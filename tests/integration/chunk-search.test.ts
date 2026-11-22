import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';

import { capture } from '../../src/server/services/library';
import { processKnowledge } from '../../src/server/jobs/knowledge-worker';
import { retrieve } from '../../src/server/services/knowledge/retrieval';
import type { KnowledgeProvider } from '../../src/server/providers/knowledge';

const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
const provider: KnowledgeProvider = {
  async analyze(text) {
    return {
      value: { summary: 'Section.', tags: ['Computing'], entities: [], relationships: [] },
      model: 'fake',
      inputTokens: 1,
      outputTokens: 1,
    };
  },
  async embed(texts) {
    return {
      value: texts.map(() => vector),
      model: 'text-embedding-3-small',
      inputTokens: 1,
      outputTokens: 0,
    };
  },
  async summarize() {
    return { value: 'Overview.', model: 'fake', inputTokens: 1, outputTokens: 1 };
  },
};
const offline: KnowledgeProvider = {
  ...provider,
  embed: async () => {
    throw new Error('offline');
  },
};
async function organize(db: Awaited<ReturnType<typeof createDatabase>>, userId: string) {
  let steps = 0;
  while (steps < 20 && (await processKnowledge(db, provider, userId))) steps++;
}
const mismatched = async (db: Awaited<ReturnType<typeof createDatabase>>) =>
  (
    await db.query<{
      n: number;
    }>(`SELECT count(*)::int AS n FROM knowledge_chunk c JOIN item i ON i.id=c.item_id AND i.user_id=c.user_id
 WHERE c.search IS DISTINCT FROM knowledge_chunk_document(i.title,c.content)`)
  ).rows[0].n;

test('chunk search vectors index the title and passage text and stay current after edits', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('cs-a','A','cs-a@test.invalid'),('cs-b','B','cs-b@test.invalid')",
    );
    const item = (
      await capture(
        'cs-a',
        {
          kind: 'note',
          title: 'Quantum notebook',
          text: 'Processors execute instructions in order.',
        },
        'web',
        db,
      )
    ).item;
    await capture(
      'cs-b',
      { kind: 'note', title: 'Quantum secrets', text: 'Processors belong to another account.' },
      'web',
      db,
    );
    await organize(db, 'cs-a');
    await organize(db, 'cs-b');
    assert.equal(
      await mismatched(db),
      0,
      'Every chunk stores exactly the document the query used to compute at read time.',
    );

    // A term from the title and a term from the text still match the same passage, inside the owner's library only.
    const found = await retrieve('cs-a', 'quantum processors', {}, db, offline);
    assert.equal(found.degraded, true);
    assert.deepEqual([...new Set(found.evidence.map((e) => e.itemId))], [item.id]);

    // Editing the title rewrites chunks; the stored vector follows the new title.
    await db.query("UPDATE item SET title='Classical notebook' WHERE id=$1", [item.id]);
    await organize(db, 'cs-a');
    assert.equal(await mismatched(db), 0);
    assert.deepEqual(
      (await retrieve('cs-a', 'classical processors', {}, db, offline)).evidence.map(
        (e) => e.itemId,
      ),
      [item.id],
    );
    assert.equal(
      (await retrieve('cs-a', 'quantum processors', {}, db, offline)).evidence.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test('library search matches word forms and ignores question words', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('cs-stem','S','cs-stem@test.invalid')",
    );
    const item = (
      await capture(
        'cs-stem',
        {
          kind: 'note',
          title: 'Field notes',
          text: 'Autonomous agent organizes the research archive.',
        },
        'web',
        db,
      )
    ).item;
    await capture(
      'cs-stem',
      { kind: 'note', title: 'Cooking', text: 'Slow roasted vegetables with garlic.' },
      'web',
      db,
    );
    await organize(db, 'cs-stem');
    assert.deepEqual(
      [
        ...new Set(
          (
            await retrieve('cs-stem', 'what did I save about agents organizing?', {}, db, offline)
          ).evidence.map((e) => e.itemId),
        ),
      ],
      [item.id],
    );
    assert.equal(
      (await retrieve('cs-stem', 'agents baking', {}, db, offline)).evidence.length,
      0,
      'Every topic word must match.',
    );
  } finally {
    await db.close();
  }
});
