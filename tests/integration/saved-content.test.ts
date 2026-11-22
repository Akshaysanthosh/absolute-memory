import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import { matchesSavedContent } from '../../src/server/services/saved-content';
import { listLibraryItems } from '../../src/server/services/library-search';
import { extractSavedPage } from '../../src/server/services/extract';

test('quotes retain exact text and provenance, and deduplicate by owner', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('a','A','a@quote.invalid'),('b','B','b@quote.invalid')`,
    );
    const input = {
      kind: 'quote' as const,
      title: 'Shirts',
      sourceUrl: 'https://example.com/story',
      text: '  A blue cotton shirt & matching buttons.  ',
    };
    const saved = await capture('a', input, 'extension', db);
    const duplicate = await capture('a', input, 'extension', db);
    const other = await capture('b', input, 'extension', db);
    assert.equal(duplicate.item.id, saved.item.id);
    assert.equal(duplicate.duplicate, true);
    assert.notEqual(other.item.id, saved.item.id);
    assert.equal(saved.item.passages[0].text, input.text);
    assert.equal(saved.item.source_details?.quote?.url, input.sourceUrl);
    const [item] = await listLibraryItems('a', db);
    assert.ok(item.tags?.includes('blue'));
    assert.ok(matchesSavedContent(item, 'blue matching'));
    await db.query('UPDATE item SET title=$2 WHERE id=$1', [item.id, 'Updated quote title']);
    assert.ok((await listLibraryItems('a', db))[0].tags?.includes('blue'));
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('product metadata keeps the brand, seller, variant color and product type distinct', () => {
  const html = `<html><head><meta property="og:type" content="product"><script type="application/ld+json">{"@type":"Product","name":"Men&#39;s Navy Blue Shirt","brand":{"name":"Example Brand"},"offers":{"seller":{"name":"Example Shop"},"price":"29","priceCurrency":"USD"},"color":"Navy Blue"}</script></head></html>`;
  const result = extractSavedPage(html, 'https://example.com/products/shirt');
  assert.equal(result.bookmarkType, 'product');
  assert.equal(result.title, "Men's Navy Blue Shirt");
  assert.deepEqual(result.details?.product, {
    brand: 'Example Brand',
    retailer: 'Example Shop',
    color: 'Navy Blue',
    price: 'USD 29',
  });
  assert.ok(result.tags?.includes('shirt'));
});
