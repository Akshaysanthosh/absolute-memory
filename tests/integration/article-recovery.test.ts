import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import { ArticleImportError, extractSavedPage } from '../../src/server/services/extract';
import { processNext } from '../../src/server/jobs/worker';

test('permanent article failures stop immediately and a fresh loaded-page save repairs the same item', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('recovery','Reader','recovery@test.invalid')`,
    );
    const url = 'https://example.org/blocked';
    const saved = await capture('recovery', { kind: 'article', url }, 'web', db);
    let calls = 0;
    const blocked = async () => {
      calls++;
      throw new ArticleImportError('HTTP 403. Save the loaded page in Chrome.');
    };
    await processNext(db, blocked, 'recovery');
    assert.equal(await processNext(db, blocked, 'recovery'), false);
    assert.equal(calls, 1);
    const failure = (await db.query('SELECT status,error FROM item WHERE id=$1', [saved.item.id]))
      .rows[0];
    assert.equal(failure.status, 'failed');
    assert.match(String(failure.error), /Chrome/);
    const text =
      'Readers connect useful information by carefully comparing sources and recording what they learn. A readable saved copy helps them return to the evidence when they need it. ';
    const html =
      '<html><head><title>Recovered article</title></head><body><article><p>' +
      text.repeat(3) +
      '</p><p>' +
      text.repeat(3) +
      '</p></article></body></html>';
    await db.query(
      `UPDATE item SET title='My chosen title',source_details='{"titleEdited":true}'::jsonb WHERE id=$1`,
      [saved.item.id],
    );
    const repaired = await capture(
      'recovery',
      { kind: 'article', url, captured: { html } },
      'extension',
      db,
    );
    assert.equal(repaired.item.title, 'My chosen title');
    assert.equal(repaired.item.source_details?.titleEdited, true);
    assert.equal(repaired.item.id, saved.item.id);
    assert.equal(repaired.item.status, 'ready');
    assert.ok(repaired.item.words > 80);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('temporary article failures retry at most three times and unreadable pages keep their metadata', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('temporary','Reader','temporary@test.invalid')`,
    );
    const saved = await capture(
      'temporary',
      { kind: 'article', url: 'https://example.org/outage' },
      'web',
      db,
    );
    let calls = 0;
    const unavailable = async () => {
      calls++;
      throw new ArticleImportError('HTTP 503', true);
    };
    for (let i = 0; i < 3; i++) {
      await db.query('UPDATE import_job SET available_at=now() WHERE item_id=$1', [saved.item.id]);
      await processNext(db, unavailable, 'temporary');
      assert.equal(
        (await db.query('SELECT status FROM item WHERE id=$1', [saved.item.id])).rows[0].status,
        i < 2 ? 'pending' : 'failed',
      );
    }
    assert.equal(await processNext(db, unavailable, 'temporary'), false);
    assert.equal(calls, 3);
    const shell = extractSavedPage(
      '<title>Loading</title><nav>Loading</nav>',
      'https://example.org/shell',
    );
    assert.equal(shell.bookmarkType, 'website');
    assert.deepEqual(shell.passages, []);
    assert.equal(shell.title, 'Loading');
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('saved article feedback distinguishes permanent retrieval failures from retryable imports', async () => {
  const { articleImportFeedback } = await import('../../src/shared/import-feedback');
  assert.deepEqual(articleImportFeedback('HTTP 403'), {
    label: 'Website blocked retrieval',
    retry: false,
    chrome: true,
  });
  assert.deepEqual(articleImportFeedback('This site blocked article retrieval (HTTP 401).'), {
    label: 'Sign-in required',
    retry: false,
    chrome: true,
  });
  assert.deepEqual(articleImportFeedback('That page has too little text to read here.'), {
    label: 'Article text unavailable',
    retry: false,
    chrome: true,
  });
  assert.deepEqual(articleImportFeedback('This link is not an article webpage.'), {
    label: 'Unsupported content',
    retry: false,
    chrome: false,
  });
  assert.deepEqual(articleImportFeedback('The site returned HTTP 503.'), {
    label: 'Import failed',
    retry: true,
    chrome: false,
  });
});
