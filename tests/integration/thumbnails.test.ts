import { Readable } from 'node:stream';
import type { StorageProvider } from '../../src/server/providers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { youtubeVideoId, thumbnailFor } from '../../src/server/services/thumbnails';
import { listLibraryItems } from '../../src/server/services/library-search';
import {
  documentThumbnail,
  createDocumentThumbnail,
} from '../../src/server/services/document-thumbnail';
import { createDatabase } from '../../src/server/db';

import { configureTemporaryStorage, attachTestDocument } from '../fixtures/storage';
configureTemporaryStorage();

const id = randomUUID();
const article = {
  id,
  kind: 'article' as const,
  url: 'https://example.com/article',
  title: 'An article',
};
test('thumbnails use the article lead image, exact YouTube hosts/IDs and authenticated document previews', () => {
  assert.equal(
    thumbnailFor({ ...article, source_details: { thumbnailUrl: 'https://example.com/lead.jpg' } })
      ?.url,
    'https://example.com/lead.jpg',
  );
  for (const url of [
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'http://127.0.0.1/photo.jpg',
    'https://user:secret@example.com/photo.jpg',
    'http://localhost/photo.jpg',
  ])
    assert.equal(thumbnailFor({ ...article, source_details: { thumbnailUrl: url } }), null);
  assert.equal(
    thumbnailFor({
      ...article,
      source_details: { thumbnailUrl: `/api/items/${id}/reading-images/0` },
    })?.url,
    `/api/items/${id}/reading-images/0`,
  );
  const video = 'eRr7yuxPsYg';
  for (const url of [
    `https://youtube.com/watch?v=${video}`,
    `https://music.youtube.com/watch?v=${video}`,
    `https://youtu.be/${video}?t=2`,
    `https://www.youtube.com/shorts/${video}`,
    `https://m.youtube.com/live/${video}`,
    `https://www.youtube-nocookie.com/embed/${video}`,
  ]) {
    assert.equal(youtubeVideoId(url), video);
    assert.equal(
      thumbnailFor({ ...article, url })?.url,
      `https://i.ytimg.com/vi/${video}/hqdefault.jpg`,
    );
  }
  for (const url of [
    `https://youtube.com.evil.example/watch?v=${video}`,
    `https://evil.example/watch?v=${video}`,
    'https://youtube.com/watch?v=bad',
    'https://youtube.com/playlist?list=abc',
  ])
    assert.equal(youtubeVideoId(url), null);
  assert.equal(
    thumbnailFor({ ...article, kind: 'pdf', has_source: true })?.url,
    `/api/items/${id}/thumbnail`,
  );
  assert.equal(thumbnailFor({ ...article, kind: 'pdf', has_source: false }), null);
  assert.equal(thumbnailFor({ ...article, kind: 'note', url: null }), null);
});

test('library metadata and rendered document thumbnails isolate owners, remain bounded and reject deleted sources', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3),($4,$5,$6)', [
      'thumb-a',
      'A',
      'thumb-a@test.invalid',
      'thumb-b',
      'B',
      'thumb-b@test.invalid',
    ]);
    const pdfId = randomUUID(),
      imageId = randomUUID(),
      articleId = randomUUID();
    const pdfBytes = new Uint8Array(await readFile('tests/fixtures/dummy.pdf'));
    const canvas = createCanvas(900, 700);
    canvas.getContext('2d').fillRect(0, 0, 900, 700);
    const imageBytes = await canvas.encode('png');
    for (const [itemId, kind, title] of [
      [pdfId, 'pdf', 'Document'],
      [imageId, 'image', 'Screenshot'],
      [articleId, 'article', 'Article'],
    ]) {
      await db.query(
        'INSERT INTO item(id,user_id,kind,title,source_details) VALUES($1,$2,$3,$4,$5::jsonb)',
        [
          itemId,
          'thumb-a',
          kind,
          title,
          kind === 'article'
            ? JSON.stringify({ thumbnailUrl: 'https://example.com/lead.jpg' })
            : null,
        ],
      );
    }
    for (const [itemId, mime, data] of [
      [pdfId, 'application/pdf', pdfBytes],
      [imageId, 'image/png', imageBytes],
    ] as const)
      await attachTestDocument(db, 'thumb-a', itemId, data, 'source', mime);
    const items = await listLibraryItems('thumb-a', db);
    assert.equal(items.length, 3);
    assert.equal(
      items.find((item) => item.id === articleId)?.thumbnail?.url,
      'https://example.com/lead.jpg',
    );
    assert.equal(items.find((item) => item.id === pdfId)?.thumbnail?.source, 'document');
    assert.equal('passages' in items[0], false);
    assert.equal('has_source' in items[0], false);
    assert.deepEqual(await listLibraryItems('thumb-b', db), []);
    for (const itemId of [pdfId, imageId]) {
      const result = await documentThumbnail('thumb-a', itemId, db),
        image = await loadImage(Buffer.from(result.bytes));
      assert.ok(image.width <= 560 && image.height <= 560);
      assert.ok(image.width > 0 && image.height > 0);
      let transferredOriginalBytes = 0;
      const measured = {
        ...db,
        async query<T extends Record<string, unknown>>(sql: string, params?: unknown[]) {
          const response = await db.query<T>(sql, params);
          for (const row of response.rows)
            if (row.data instanceof Uint8Array) transferredOriginalBytes += row.data.byteLength;
          return response;
        },
      };
      assert.deepEqual(await documentThumbnail('thumb-a', itemId, measured), result);
      assert.equal(
        transferredOriginalBytes,
        0,
        'Warm thumbnail requests must not transfer original file bytes',
      );
      assert.equal(
        (await documentThumbnail('thumb-a', itemId, measured, result.etag)).bytes.length,
        0,
      );
      assert.equal(transferredOriginalBytes, 0);
      await assert.rejects(
        documentThumbnail('thumb-b', itemId, db, result.etag),
        /Original file not found/,
      );
      await db.query('DELETE FROM item WHERE id=$1', [itemId]);
      await assert.rejects(documentThumbnail('thumb-a', itemId, db), /Original file not found/);
    }
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('durable thumbnails survive a cold instance without original bytes and invalidate on source change', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  const itemId = randomUUID();
  const objects = new Map<string, Uint8Array>();
  let failedUpload = false;
  const originalRequests: string[] = [];
  const store: StorageProvider = {
    async putStream() {
      throw new Error('Not used by the thumbnail fixture.');
    },
    async put(key, data) {
      if (failedUpload) throw Error('interrupted');
      objects.set(key, data.slice());
    },
    async get(key) {
      const data = objects.get(key);
      if (!data) throw Error('missing');
      if (key.includes('/original/')) originalRequests.push(key);
      return Readable.from([data]);
    },
    async delete(key) {
      objects.delete(key);
    },
    async exists(key) {
      return objects.has(key);
    },
  };
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('durable-thumb','Owner','durable-thumb@example.invalid')`,
    );
    await db.query(
      `INSERT INTO item(id,user_id,kind,title) VALUES($1,'durable-thumb','image','Image')`,
      [itemId],
    );
    const canvas = createCanvas(700, 900);
    const data = await canvas.encode('png');
    await attachTestDocument(db, 'durable-thumb', itemId, data, 'image.png', 'image/png', store);
    failedUpload = true;
    const first = await createDocumentThumbnail()('durable-thumb', itemId, db, null, store);
    failedUpload = false;
    const resumed = await createDocumentThumbnail()('durable-thumb', itemId, db, null, store);
    assert.deepEqual(first, resumed);
    assert.equal(objects.size, 2);
    const originals = originalRequests.length;
    assert.deepEqual(
      await createDocumentThumbnail()('durable-thumb', itemId, db, null, store),
      first,
    );
    assert.equal(
      originalRequests.length,
      originals,
      'a new instance reads only the small stored preview',
    );
    await assert.rejects(
      () => createDocumentThumbnail()('someone-else', itemId, db, null, store),
      /not found/,
    );
    canvas.getContext('2d').fillRect(0, 0, 700, 900);
    const replacement = await canvas.encode('png');
    await attachTestDocument(
      db,
      'durable-thumb',
      itemId,
      replacement,
      'image.png',
      'image/png',
      store,
    );
    const changed = await createDocumentThumbnail()('durable-thumb', itemId, db, first.etag, store);
    assert.notEqual(changed.etag, first.etag);
    assert.ok(changed.bytes.length);
    assert.equal((await db.query('SELECT * FROM document_asset_cleanup')).rows.length, 3);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
