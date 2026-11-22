import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { ownItem } from '../../src/server/services/library';
import { listLibraryPage } from '../../src/server/services/library-search';
import { documentTitle, itemDisplayTitle } from '../../src/shared/content-title';

import { configureTemporaryStorage, attachTestDocument } from '../fixtures/storage';
configureTemporaryStorage();

test('full-text library pages traverse over 1000 items, preserve timestamp precision and isolate owners', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES ('pages-a','A','pages-a@test.invalid'),('pages-b','B','pages-b@test.invalid')`,
    );
    await db.query(`INSERT INTO item(id,user_id,kind,title,passages,created_at)
   SELECT gen_random_uuid(),'pages-a',CASE WHEN n%2=0 THEN 'article' ELSE 'note' END,'Saved '||n,
   jsonb_build_array(jsonb_build_object('index',0,'text',repeat('ordinary text ',100)||'deepneedle '||n)),
   '2026-11-01T12:00:00.123456Z'::timestamptz + (n%3)*interval '1 microsecond'
   FROM generate_series(1,1007) n`);
    await db.query(
      `INSERT INTO item(id,user_id,kind,title,passages) VALUES (gen_random_uuid(),'pages-b','note','Private secret','[{"index":0,"text":"deepneedle otheraccount"}]')`,
    );
    await db.query(
      `INSERT INTO knowledge_tag(user_id,item_id,name,origin) SELECT user_id,id,CASE WHEN user_id='pages-a' THEN 'Older topic' ELSE 'Private topic' END,'manual' FROM item WHERE title IN ('Saved 1','Private secret')`,
    );
    assert.deepEqual((await listLibraryPage('pages-a', db, { query: 'deepneedle 1007' })).topics, [
      'Older topic',
    ]);
    assert.equal((await listLibraryPage('pages-a', db, { topic: 'Older topic' })).items.length, 1);
    const fileItem = (
      await db.query<{ id: string }>(
        "SELECT id FROM item WHERE user_id='pages-a' AND title='Saved 1'",
      )
    ).rows[0].id;
    await attachTestDocument(
      db,
      'pages-a',
      fileItem,
      Buffer.from([0]),
      'Original upload.png',
      'image/png',
    );
    assert.equal((await ownItem('pages-a', fileItem, db)).source_file?.name, 'Original upload.png');
    await assert.rejects(ownItem('pages-b', fileItem, db), /not found/);
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await listLibraryPage('pages-a', db, { limit: 60, cursor: cursor || undefined });
      pages++;
      assert.ok(page.items.length <= 60);
      for (const item of page.items) {
        assert.ok(!seen.has(item.id), 'No duplicate across pages');
        seen.add(item.id);
        assert.notEqual(item.title, 'Private secret');
        assert.equal('passages' in item, false);
      }
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(seen.size, 1007);
    assert.equal(pages, 17);
    await db.query("UPDATE item SET favorite=true,archived=true WHERE title='Saved 1007'");
    assert.equal(
      (await listLibraryPage('pages-a', db, { query: 'deepneedle 1007', filter: 'all' })).items
        .length,
      0,
    );
    assert.equal(
      (await listLibraryPage('pages-a', db, { query: 'deepneedle 1007', filter: 'archived' })).items
        .length,
      1,
    );
    assert.equal(
      (await listLibraryPage('pages-a', db, { query: 'deepneedle 1007', type: 'Article' })).items
        .length,
      0,
    );
    assert.equal(
      (await listLibraryPage('pages-a', db, { query: 'deepneedle 1007', type: 'Note' })).items
        .length,
      1,
    );
    const start = performance.now();
    const search = await listLibraryPage('pages-a', db, { query: 'deepneedle 1007' });
    assert.deepEqual(
      search.items.map((i) => i.title),
      ['Saved 1007'],
    );
    assert.ok(
      performance.now() - start < 5000,
      'Full text search completes within 5 seconds on 1007 items',
    );
    assert.equal((await listLibraryPage('pages-a', db, { query: 'otheraccount' })).items.length, 0);
    const first = await listLibraryPage('pages-a', db, { limit: 1 });
    const foreignCursor = await listLibraryPage('pages-b', db, { cursor: first.nextCursor! });
    assert.ok(foreignCursor.items.every((i) => i.title === 'Private secret'));
    for (const cursor of [
      'not-json',
      Buffer.from(JSON.stringify({ date: 'invalid', id: 'x' })).toString('base64url'),
    ])
      await assert.rejects(listLibraryPage('pages-a', db, { cursor }), /Invalid library page/);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('document display names prefer headings, retain meaningful filenames and protect manual titles', () => {
  assert.equal(documentTitle('Screenshot 2026-11-13.png'), 'Saved image');
  assert.equal(documentTitle('Project_budget.pdf'), 'Project budget');
  assert.equal(documentTitle('scan_123.pdf', 'Quarterly review'), 'Quarterly review');
  assert.equal(
    itemDisplayTitle({
      kind: 'image',
      title: 'Screenshot 2026',
      source_details: { image: { description: 'A red shirt on a hanger.', brand: '' } },
    }),
    'A red shirt on a hanger',
  );
  assert.equal(
    itemDisplayTitle({
      kind: 'image',
      title: 'Screenshot collection',
      source_details: { titleEdited: true, image: { description: 'A red shirt.', brand: '' } },
    }),
    'Screenshot collection',
  );
});

test('search finds body-only evidence across articles, transcripts, PDF, OCR and quotes', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES ('search-owner','A','search-owner@test.invalid'),('search-other','B','search-other@test.invalid')`,
    );
    const fixtures = [
      { kind: 'article', label: 'Article', needle: 'nebulaarticle', details: {} },
      { kind: 'article', label: 'YouTube transcript', needle: 'nebulavideo', details: {} },
      { kind: 'article', label: 'Podcast transcript', needle: 'nebulapodcast', details: {} },
      { kind: 'pdf', label: 'Document', needle: 'nebuladocument', details: {} },
      {
        kind: 'image',
        label: 'Screenshot',
        needle: 'nebulaocr',
        details: { image: { description: 'A blue jacket' } },
      },
      {
        kind: 'note',
        label: 'Quote',
        needle: 'nebulaquote',
        details: { quote: { title: 'Saved quotation' } },
      },
    ];
    for (const fixture of fixtures) {
      await db.query(
        `INSERT INTO item(id,user_id,kind,title,excerpt,passages,source_details) VALUES(gen_random_uuid(),'search-owner',$1,$2,'Unrelated excerpt',$3::jsonb,$4::jsonb)`,
        [
          fixture.kind,
          fixture.label,
          JSON.stringify([{ index: 0, text: 'Intro. '.repeat(3000) + fixture.needle }]),
          JSON.stringify({ ...fixture.details, titleEdited: true }),
        ],
      );
      assert.deepEqual(
        (await listLibraryPage('search-owner', db, { query: fixture.needle })).items.map(
          (item) => item.title,
        ),
        [fixture.label],
      );
      assert.equal(
        (await listLibraryPage('search-other', db, { query: fixture.needle })).items.length,
        0,
      );
    }
    assert.deepEqual(
      (await listLibraryPage('search-owner', db, { query: 'blue jacket' })).items.map(
        (item) => item.title,
      ),
      ['Screenshot'],
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
