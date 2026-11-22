import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import { extractSavedPage, ArticleImportError } from '../../src/server/services/extract';
import { processNext } from '../../src/server/jobs/worker';
import { listLibraryItems } from '../../src/server/services/library-search';
import { saveAsBookmark } from '../../src/server/services/bookmarks';

test('loaded websites and worker-extracted products become tagged bookmarks; blocked articles remain recoverable', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('reader','Reader','reader@test.invalid'),('other','Other','other@test.invalid')`,
    );
    const website = await capture(
      'reader',
      {
        kind: 'article',
        url: 'https://example.org/',
        captured: {
          html: '<html><head><title>Studio</title><meta name="description" content="Graphic design portfolio"></head></html>',
        },
      },
      'extension',
      db,
    );
    assert.equal(website.item.bookmark_type, 'website');
    assert.equal(website.item.status, 'ready');
    const product = await capture(
      'reader',
      { kind: 'article', url: 'https://example.org/products/chair' },
      'web',
      db,
    );
    await processNext(
      db,
      async (url) =>
        extractSavedPage(
          '<html><head><title>Chair</title><meta property="og:type" content="product"><meta property="og:image" content="/chair.jpg"></head></html>',
          url,
        ),
      'reader',
    );
    const article = await capture(
      'reader',
      { kind: 'article', url: 'https://example.org/story' },
      'web',
      db,
    );
    await processNext(
      db,
      async () => {
        throw new ArticleImportError('HTTP 403');
      },
      'reader',
    );
    const items = await listLibraryItems('reader', db);
    assert.deepEqual(items.find((i) => i.id === website.item.id)?.tags, ['bookmarks']);
    const savedProduct = items.find((i) => i.id === product.item.id);
    assert.equal(savedProduct?.bookmark_type, 'product');
    assert.equal(savedProduct?.thumbnail?.url, 'https://example.org/chair.jpg');
    assert.deepEqual(savedProduct?.tags, ['bookmarks', 'chair', 'product']);
    const blocked = items.find((i) => i.id === article.item.id);
    assert.equal(blocked?.status, 'failed');
    assert.equal(blocked?.bookmark_type, null);
    await assert.rejects(db.transaction((tx) => saveAsBookmark(tx, 'other', article.item.id)));
    await db.transaction((tx) => saveAsBookmark(tx, 'reader', article.item.id));
    assert.equal(
      (await listLibraryItems('reader', db)).find((i) => i.id === article.item.id)?.bookmark_type,
      'website',
    );
    await db.transaction((tx) => saveAsBookmark(tx, 'reader', article.item.id, 'product'));
    assert.equal(
      (await listLibraryItems('reader', db)).find((i) => i.id === article.item.id)?.bookmark_type,
      'product',
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('product schema outranks generic article wrappers, but not explicit editorial metadata', () => {
  const schema =
    '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"https://schema.org/Product","name":"Blue shirt","offers":{"price":"25","priceCurrency":"USD"}}]}</script>';
  const body = '<article><h1>Blue shirt</h1><p>Buy a blue shirt.</p></article>';
  const page = extractSavedPage(
    `<html><head><title>Blue shirt</title>${schema}</head><body>${body}</body></html>`,
    'https://shop.example/products/blue-shirt',
  );
  assert.equal(page.bookmarkType, 'product');
  assert.equal(page.details?.product?.price, 'USD 25');
  const review = extractSavedPage(
    `<html><head><title>Shirt review</title><meta property="og:type" content="article">${schema}</head><body><article><h1>Shirt review</h1><p>Short review.</p></article></body></html>`,
    'https://example.org/reviews/shirt',
  );
  assert.equal(review.details?.product, undefined);
  assert.notEqual(review.bookmarkType, 'product');
});
