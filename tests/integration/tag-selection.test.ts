import test from 'node:test';
import assert from 'node:assert/strict';

test('organizing prefers tags the library already uses', async () => {
  const { createDatabase } = await import('../../src/server/db');
  const { capture } = await import('../../src/server/services/library');
  const { processKnowledge } = await import('../../src/server/jobs/knowledge-worker');
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query("INSERT INTO \"user\"(id,name,email) VALUES('tg','T','tg@test.invalid')");
    const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    const provider = (tags: string[]) => ({
      async analyze() {
        return {
          value: { summary: 'S.', tags, entities: [], relationships: [] },
          model: 'fake',
          inputTokens: 1,
          outputTokens: 1,
        };
      },
      async embed(texts: string[]) {
        return { value: texts.map(() => vector), model: 'e', inputTokens: 1, outputTokens: 0 };
      },
      async summarize() {
        return { value: 'O.', model: 'fake', inputTokens: 1, outputTokens: 1 };
      },
    });
    await capture('tg', { kind: 'note', title: 'First', text: 'About retrieval.' }, 'web', db);
    let n = 0;
    while (n++ < 20 && (await processKnowledge(db, provider(['vector search']), 'tg')));
    const second = (
      await capture('tg', { kind: 'note', title: 'Second', text: 'More retrieval.' }, 'web', db)
    ).item;
    n = 0;
    while (
      n++ < 20 &&
      (await processKnowledge(
        db,
        provider(['alpha', 'beta', 'gamma', 'delta', 'vector search']),
        'tg',
      ))
    );
    const names = (
      await db.query<{ name: string }>(
        "SELECT name FROM knowledge_tag WHERE item_id=$1 AND origin='auto'",
        [second.id],
      )
    ).rows.map((r) => r.name);
    assert.ok(
      names.includes('vector search'),
      `existing tag kept within the four slots: ${names.join(', ')}`,
    );
    assert.equal(names.length, 4);
  } finally {
    await db.close();
  }
});
