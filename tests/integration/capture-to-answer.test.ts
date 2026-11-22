import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createDatabase } from '../../src/server/db';
import { runKnowledgeBatch } from '../../src/server/jobs/knowledge-worker';
import { answerLibrary } from '../../src/server/services/knowledge/answer';
import { capture, ownItem } from '../../src/server/services/library';
import { listLibraryPage } from '../../src/server/services/library-search';
import { startMockProvider } from '../fixtures/mock-provider/server';

test('a captured article becomes searchable evidence and a numbered Reader link', async (t) => {
  const provider = await startMockProvider();
  t.after(provider.close);
  for (const [key, value] of Object.entries({
    AM_TEST_DB: 'memory',
    AI_BASE_URL: provider.baseURL,
    AI_MODEL: 'fixture-chat',
    EMBEDDINGS_BASE_URL: provider.baseURL,
    EMBEDDINGS_MODEL: 'fixture-embedding',
    EMBEDDINGS_DIMENSIONS: '8',
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const db = await createDatabase();
  t.after(() => db.close());
  await db.query(
    `INSERT INTO "user"(id,name,email) VALUES('reader','Reader','reader@example.invalid')`,
  );
  const html = await readFile('tests/fixtures/reading/article.html', 'utf8');
  const { item } = await capture(
    'reader',
    { kind: 'article', url: 'https://example.org/dispatch', captured: { html } },
    'web',
    db,
  );
  assert.equal(item.status, 'ready');
  assert.ok((await runKnowledgeBatch('reader', db)) > 0);

  const keyword = await listLibraryPage('reader', db, { query: 'harbour', semantic: false });
  assert.equal(keyword.items[0]?.id, item.id);
  const onlyVector = 'amethyst';
  assert.equal(
    (await listLibraryPage('reader', db, { query: onlyVector, semantic: false })).items.length,
    0,
  );
  assert.equal((await listLibraryPage('reader', db, { query: onlyVector })).items[0]?.id, item.id);

  const answer = await answerLibrary(
    'reader',
    'What did the harbour report?',
    {},
    AbortSignal.timeout(10_000),
    db,
  );
  assert.match(answer.answer, /\[1\]/);
  const citation = answer.sources[0];
  assert.equal(citation.itemId, item.id);
  assert.equal(citation.path, `/read/${item.id}#p-${citation.passageIndex}`);
  const saved = await ownItem('reader', item.id, db);
  assert.ok(saved.passages[citation.passageIndex]?.text.length);
  assert.ok(saved.reading_html.includes(`id="p-${citation.passageIndex}"`));
});
