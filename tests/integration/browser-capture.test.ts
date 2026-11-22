import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
const html =
  '<html><head><title>Browser captured article</title></head><body><article><h1>Browser captured article</h1>' +
  Array.from(
    { length: 8 },
    () =>
      '<p>This accessible article describes how curious people connect knowledge through reading and thoughtful reflection. Saving the loaded browser content makes the information available when a remote server cannot fetch the original source.</p>',
  ).join('') +
  '</article></body></html>';
test('browser capture is ready without origin fetch, repairs failures, preserves duplicates and tenant ownership', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('capture-a','A','ca@test.invalid'),('capture-b','B','cb@test.invalid')`,
    );
    for (const unsupported of [
      'https://www.youtube.com/',
      'https://www.youtube.com/@example',
      'https://www.youtube.com/playlist?list=example',
      'https://music.youtube.com/',
      'https://music.youtube.com/channel/example',
      'https://www.youtube-nocookie.com/embed/bad',
    ]) {
      await assert.rejects(
        capture('capture-a', { kind: 'article', url: unsupported }, 'web', db),
        /specific YouTube video link/,
      );
    }
    assert.equal((await db.query('SELECT * FROM import_job')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM item')).rows.length, 0);
    const url = 'https://example.org/browser-article';
    const failed = await capture('capture-a', { kind: 'article', url }, 'extension', db);
    await db.query("UPDATE item SET status='failed',error='HTTP 403' WHERE id=$1", [
      failed.item.id,
    ]);
    const repaired = await capture(
      'capture-a',
      { kind: 'article', url, captured: { html } },
      'extension',
      db,
    );
    assert.equal(repaired.item.id, failed.item.id);
    assert.equal(repaired.item.status, 'ready');
    assert.ok(repaired.item.words > 80);
    assert.equal(
      (await db.query('SELECT state FROM import_job WHERE item_id=$1', [failed.item.id])).rows[0]
        .state,
      'done',
    );
    const again = await capture(
      'capture-a',
      { kind: 'article', url, captured: { html: html.replaceAll('curious', 'changed') } },
      'extension',
      db,
    );
    assert.deepEqual(again.item.passages, repaired.item.passages);
    const other = await capture(
      'capture-b',
      { kind: 'article', url, captured: { html } },
      'extension',
      db,
    );
    assert.notEqual(other.item.id, repaired.item.id);
    assert.equal(other.item.status, 'ready');
    assert.equal(
      (await db.query('SELECT * FROM import_job WHERE item_id=$1', [other.item.id])).rows.length,
      0,
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('page capture removes scripts/forms and resolves loaded image and link references', async () => {
  const { JSDOM } = await import('jsdom');
  const { captureLoadedPage } = await import('../../extension/page-capture.mjs');
  const dom = new JSDOM(
    '<title>Test capture</title><article><p>Visible text</p><script>secret()</script><form><input value="private"></form><img src="/image.jpg"><a href="/source">Source</a></article>',
    { url: 'https://example.org/article' },
  );
  const previous = globalThis.document;
  try {
    globalThis.document = dom.window.document;
    const result = captureLoadedPage();
    assert.ok(result.html.includes('https://example.org/image.jpg'));
    assert.ok(result.html.includes('https://example.org/source'));
    assert.ok(!result.html.includes('secret()'));
    assert.ok(!result.html.includes('private'));
  } finally {
    globalThis.document = previous;
    dom.window.close();
  }
});

test('browser capture preserves unloaded responsive images and lead metadata through reader extraction', async () => {
  const { JSDOM } = await import('jsdom');
  const { captureLoadedPage } = await import('../../extension/page-capture.mjs');
  const { extractSavedPage } = await import('../../src/server/services/extract');
  const prose =
    'A detailed report explains how processors handle concurrent tasks and why the benchmark matters. The researchers measured performance carefully and compared several different systems under the same workload. ';
  const dom = new JSDOM(
    `<head><title>Responsive benchmark</title><meta property="og:image" content="/benchmark-lead.jpg"></head><body><header><img src="/benchmark-lead.jpg" alt="Processor"></header><article><h1>Responsive benchmark</h1><p>${prose.repeat(3)}</p><figure><img src="data:image/gif;base64,R0" srcset="/small.jpg 400w, /large.jpg 1600w" alt="Benchmark chart"><figcaption>Measured throughput</figcaption></figure><p>${prose.repeat(3)}</p></article></body>`,
    { url: 'https://example.org/report' },
  );
  const previous = globalThis.document;
  try {
    globalThis.document = dom.window.document;
    const captured = captureLoadedPage();
    const first = extractSavedPage(captured.html, 'https://example.org/report');
    assert.equal(first.leadImage, 'https://example.org/benchmark-lead.jpg');
    assert.ok(first.images?.some((image) => image.source === 'https://example.org/small.jpg'));
    assert.match(first.readingHtml, /alt="Benchmark chart"/);
    assert.ok(first.passages.some((passage) => passage.text === 'Measured throughput'));
    dom.window.document.querySelector('header')?.remove();
    const second = extractSavedPage(captureLoadedPage().html, 'https://example.org/report');
    assert.equal(second.leadImage, 'https://example.org/benchmark-lead.jpg');
    assert.deepEqual(
      second.images?.map((image) => image.source),
      ['https://example.org/small.jpg'],
    );
  } finally {
    globalThis.document = previous;
    dom.window.close();
  }
});

test('Chrome-injected extraction runs after function serialization without module or service-worker bindings', async () => {
  const { JSDOM } = await import('jsdom');
  const { runInNewContext } = await import('node:vm');
  const { captureLoadedPage } = await import('../../extension/page-capture.mjs');
  const dom = new JSDOM(
    '<title>Isolated capture</title><article><h1>Isolated capture</h1><p>Only the selected page document is available to the serialized capture function.</p><img data-src="/chart.jpg"><form><input value="credential-marker"></form></article>',
    { url: 'https://example.org/isolated' },
  );
  try {
    // Chrome sends func across a context boundary; imported helpers and worker state do not follow it.
    const result = runInNewContext(
      `(${captureLoadedPage.toString()})()`,
      { document: dom.window.document, URL, TextEncoder },
      { timeout: 1000 },
    );
    assert.equal(typeof result.html, 'string');
    assert.match(result.html, /Only the selected page/);
    assert.match(result.html, /https:\/\/example.org\/chart.jpg/);
    assert.equal(result.html.includes('credential-marker'), false);
    assert.equal(result.html.includes('<form'), false);
  } finally {
    dom.window.close();
  }
});

test('Chrome capture preserves public product fields while omitting unrelated structured data', async () => {
  const { JSDOM } = await import('jsdom');
  const { runInNewContext } = await import('node:vm');
  const { captureLoadedPage } = await import('../../extension/page-capture.mjs');
  const { extractSavedPage } = await import('../../src/server/services/extract');
  const dom = new JSDOM(
    `<head><title>Navy Shirt</title><meta property="og:type" content="product"><script type="application/ld+json">{"@graph":[{"@type":"Person","name":"private-irrelevant-marker"},{"@type":"Product","name":"Navy Shirt","brand":{"name":"Example Brand"},"color":"Navy","image":"/shirt.jpg","offers":{"seller":{"name":"Example Shop"},"price":"42","priceCurrency":"USD"}}]}</script></head><main><h1>Navy Shirt</h1></main>`,
    { url: 'https://example.org/products/shirt' },
  );
  try {
    const saved = runInNewContext(
      `(${captureLoadedPage.toString()})()`,
      { document: dom.window.document, URL, TextEncoder },
      { timeout: 1000 },
    );
    assert.equal(saved.html.includes('private-irrelevant-marker'), false);
    const result = extractSavedPage(saved.html, saved.documentUrl);
    assert.equal(result.bookmarkType, 'product');
    assert.deepEqual(result.details?.product, {
      brand: 'Example Brand',
      retailer: 'Example Shop',
      color: 'Navy',
      price: 'USD 42',
    });
    assert.deepEqual(result.passages, []);
  } finally {
    dom.window.close();
  }
});
