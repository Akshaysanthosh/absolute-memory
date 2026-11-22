import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createDatabase } from '../../src/server/db';
import { processKnowledge } from '../../src/server/jobs/knowledge-worker';
import { chunksFor } from '../../src/server/services/knowledge/content';
import { retrieve } from '../../src/server/services/knowledge/retrieval';
import { sourceAvailability } from '../../src/server/services/knowledge/citations';
import { listLibraryPage } from '../../src/server/services/library-search';
import {
  deleteHighlight,
  getHighlights,
  saveReadingPosition,
} from '../../src/server/repos/reading';
import { extractReading } from '../../src/server/services/import/article';
import {
  finishImages,
  plainReading,
  prepareContent,
} from '../../src/server/services/import/content';
import { insertLegacyEntries } from '../../src/server/services/transfers/legacy-import';
import {
  createHighlight,
  listHighlightPage,
  reanchorHighlights,
} from '../../src/server/services/reading';
import { findQuote, passageHref, validateSegments } from '../../src/shared/passages';

const base = 'https://gazette.example.test/research';
const fixture = (name: string) =>
  readFile(new URL(`../fixtures/reading/${name}.html`, import.meta.url), 'utf8');

test('article extraction retains metadata and stable sequential passages', async () => {
  const html = await fixture('article');
  const first = extractReading(html, base);
  const second = extractReading(html, base);
  assert.equal(first.title, 'Harbour wind research');
  assert.equal(first.byline, 'Jamie Example');
  assert.equal(first.siteName, 'Synthetic Gazette');
  assert.equal(first.publishedAt, '2026-01-10T09:00:00Z');
  assert.equal(first.leadImage, 'https://gazette.example.test/lead.jpg');
  assert.ok(first.passages.length >= 3);
  assert.deepEqual(first.passages, second.passages);
  assert.equal(first.html, second.html);
  assert.ok(first.passages.every((passage, i) => passage.index === i));
});

test('sanitiser preserves MathML and trusted link attributes plus locally attached images', async () => {
  const result = prepareContent(await fixture('unsafe'), base);
  assert.deepEqual(result.images, [
    { slot: 0, source: 'https://gazette.example.test/diagram.png' },
  ]);
  const reading = finishImages(result.html, new Map([[0, '/api/items/example/reading-images/0']]));
  assert.match(reading, /<math><msup>/);
  assert.match(
    reading,
    /href="https:\/\/gazette.example.test\/reference" rel="noopener noreferrer nofollow"/,
  );
  assert.match(reading, /src="\/api\/items\/example\/reading-images\/0"/);
  assert.match(reading, /id="p-0"/);
  assert.doesNotMatch(
    reading,
    /<script|<svg|<iframe|<form|onclick|onerror|javascript:|style=|p-800|\/icon\.png/,
  );
});

test('empty pages can still be saved with metadata', () => {
  const article = extractReading(
    '<title>Directory</title><nav><a href="/home">Home</a></nav>',
    base,
  );
  assert.equal(article.title, 'Directory');
  assert.equal(article.readable, false);
  assert.deepEqual(article.passages, []);
});

test('knowledge chunks record every passage they cover without losing their text', () => {
  const large = 'Oceanic sediment records. '.repeat(350);
  const chunks = chunksFor([
    { index: 0, text: large },
    { index: 1, text: 'A newer observation.' },
  ]);
  assert.ok(chunks.length >= 3);
  assert.equal(chunks.map((chunk) => chunk.content).join(''), large + '\n\nA newer observation.');
  assert.deepEqual(chunks[0].passageIndices, [0]);
  assert.deepEqual(chunks.at(-1)?.passageIndices, [0, 1]);
});

test('a quote spanning two passages is anchored, validated and persisted atomically', async () => {
  const { html, passages } = plainReading(
    'The first paragraph ends here.\n\nThe next one starts here.',
  );
  const segments = findQuote(passages, 'ends here.\nThe next');
  assert.equal(segments.length, 2);
  assert.ok(validateSegments(passages, segments));
  assert.equal(passageHref('item', segments[1].passageIndex), '/read/item#p-1');
  assert.deepEqual(findQuote(passages, 'here'), []);
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id, name, email) VALUES ($1, $2, $3)', [
      'owner',
      'Owner',
      'owner@example.test',
    ]);
    const itemId = randomUUID();
    await db.query(
      'INSERT INTO item(id, user_id, kind, title, passages, reading_html) VALUES ($1,$2,$3,$4,$5,$6)',
      [itemId, 'owner', 'article', 'Fixture', JSON.stringify(passages), html],
    );
    const saved = await createHighlight('owner', itemId, segments, db);
    assert.deepEqual(
      (await getHighlights(db, 'owner', { limit: 10, offset: 0 }))[0].segments,
      segments,
    );
    assert.equal(await processKnowledge(db), true);
    const { evidence } = await retrieve('owner', 'paragraph', {}, db);
    const [citation] = evidence;
    assert.equal(citation.itemId, itemId);
    assert.equal(passageHref(citation.itemId, citation.passageIndex), `/read/${itemId}#p-0`);
    const source = {
      type: 'saved' as const,
      key: '1',
      itemId,
      title: citation.title,
      passageIndex: citation.passageIndex,
      quote: citation.text,
    };
    assert.deepEqual(await sourceAvailability('owner', [source], db), [
      { ...source, available: true },
    ]);
    assert.deepEqual(await sourceAvailability('other', [source], db), [
      { ...source, available: false },
    ]);
    await db.query(
      "INSERT INTO highlight(id,user_id,item_id,quote) VALUES($1,'owner',$2,'Unanchored pelagic drift')",
      [randomUUID(), itemId],
    );
    const listed = await listHighlightPage('owner', { limit: 1, offset: 0 }, db);
    assert.equal(listed.nextOffset, 1);
    assert.equal(listed.highlights[0].path, null);
    const next = await listHighlightPage('owner', { limit: 1, offset: listed.nextOffset }, db);
    assert.equal(next.nextOffset, null);
    assert.equal(next.highlights[0].path, passageHref(itemId, 0));
    assert.deepEqual(await listHighlightPage('other', { limit: 1, offset: 0 }, db), {
      highlights: [],
      nextOffset: null,
    });
    const matches = await listLibraryPage('owner', db, { query: 'pelagic', semantic: false });
    assert.equal(matches.items[0].excerpt, 'Unanchored pelagic drift');
    assert.deepEqual(
      (await listLibraryPage('other', db, { query: 'pelagic', semantic: false })).items,
      [],
    );
    await db.query("DELETE FROM highlight WHERE quote='Unanchored pelagic drift'");
    assert.equal(await saveReadingPosition(db, 'owner', itemId, 1, 0.5), true);
    assert.equal(await saveReadingPosition(db, 'owner', itemId, 2, 0.8), false);
    assert.equal(await deleteHighlight(db, 'other', itemId, saved.id), false);
    assert.equal(await deleteHighlight(db, 'owner', itemId, saved.id), true);
    assert.deepEqual(await getHighlights(db, 'owner', { limit: 10, offset: 0 }), []);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('Readability handles a blog, documentation, a gallery and a page with advertising', async () => {
  const cases = [
    { file: 'blog', passage: 'Save seeds only from healthy plants.' },
    { file: 'documentation', passage: 'depth = millimetres / 1000' },
    { file: 'gallery', passage: 'The planting schedule' },
    { file: 'ad-heavy', passage: 'The city compared the new survey' },
  ];
  for (const { file, passage } of cases) {
    const article = extractReading(await fixture(file), base);
    assert.equal(article.readable, true, file);
    assert.ok(
      article.passages.some((part) => part.text.includes(passage)),
      file,
    );
    assert.doesNotMatch(
      article.html,
      /Sponsored purchase|Enter a prize draw|Related bargain|Cookie preferences|<iframe/,
    );
    if (file === 'gallery') {
      assert.equal(article.leadImage, 'https://gazette.example.test/cover.png');
      assert.deepEqual(
        article.images.map((image) => image.source),
        ['https://gazette.example.test/binding.jpg', 'https://gazette.example.test/ledger.png'],
      );
    }
  }
});

test('nested lists include their parent text and a quote can re-anchor across whitespace', () => {
  const { passages, html } = prepareContent(
    '<ol><li>A <strong>nested</strong> chapter<ul><li>starts here.</li></ul></li></ol>',
    base,
  );
  assert.deepEqual(
    passages.map((passage) => passage.text),
    ['A nested chapter', 'starts here.'],
  );
  assert.match(html, /<li data-passage="0"><p data-passage="0" id="p-0"/);
  const segments = findQuote(passages, 'nested chapter starts');
  assert.deepEqual(
    segments.map((segment) => segment.text),
    ['nested chapter', 'starts'],
  );
  assert.ok(validateSegments(passages, segments));
});

test('external quotes re-anchor across passages on import or after an unavailable article is repaired', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id,name,email) VALUES ($1,$2,$3)', [
      'importer',
      'Importer',
      'import@example.test',
    ]);
    const url = 'https://reader.example.test/archived';
    await db.transaction((tx) =>
      insertLegacyEntries(tx, 'importer', [
        {
          url,
          title: 'Archived notes',
          text: 'An earlier paragraph ends.\n\nA later paragraph begins.',
          highlights: [
            { quote: 'paragraph ends. A later' },
            { quote: 'The archive did not include this quote.' },
          ],
        },
      ]),
    );
    const [item] = (
      await db.query<{ id: string }>('SELECT id FROM item WHERE user_id=$1 AND url=$2', [
        'importer',
        url,
      ])
    ).rows;
    const marks = await getHighlights(db, 'importer', { itemId: item.id, limit: 5, offset: 0 });
    assert.equal(
      marks.find((mark) => mark.quote === 'paragraph ends. A later')?.segments.length,
      2,
    );
    assert.deepEqual(marks.find((mark) => mark.quote.startsWith('The archive'))?.segments, []);
    const recovered = plainReading(
      'The archive did not include this quote.\n\nAnother observation appears here.',
    );
    await db.transaction(async (tx) => {
      await tx.query('UPDATE item SET passages=$2,reading_html=$3 WHERE id=$1', [
        item.id,
        JSON.stringify(recovered.passages),
        recovered.html,
      ]);
      await reanchorHighlights(tx, 'importer', item.id, recovered.passages);
    });
    const updated = await getHighlights(db, 'importer', { itemId: item.id, limit: 5, offset: 0 });
    assert.equal(
      updated.find((mark) => mark.quote.startsWith('The archive'))?.segments[0].passageIndex,
      0,
    );
    assert.deepEqual(
      updated.find((mark) => mark.quote === 'paragraph ends. A later')?.segments,
      [],
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
