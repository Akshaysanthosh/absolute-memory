import { maximumUploadBytes } from '../../src/server/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import { processNext } from '../../src/server/jobs/worker';
import { imageMime } from '../../src/shared/image-file';
import type { ImportedPage } from '../../src/server/services/extract';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc1sAAAAASUVORK5CYII=',
  'base64',
);
const result = (): ImportedPage => ({
  title: 'Picture',
  author: null,
  domain: 'example.org',
  excerpt: '',
  passages: [],
  readingHtml: '',
  words: 0,
  image: { data: png, mime: 'image/png', name: 'picture.png' },
});
import { configureTemporaryStorage } from '../fixtures/storage';
configureTemporaryStorage();

test('supported image signatures exclude HTML and SVG', () => {
  assert.equal(imageMime(png), 'image/png');
  assert.equal(imageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(imageMime(Buffer.from('<html>not an image</html>')), null);
});
test('image URL jobs retain one owned original; reject stale and oversized files atomically', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('reader','Reader','image@test.invalid'),('other','Other','other@test.invalid')`,
    );
    const first = await capture(
      'reader',
      { kind: 'article', url: 'https://example.org/picture.png' },
      'web',
      db,
    );
    await processNext(db, async () => result(), 'reader');
    const {
      rows: [saved],
    } = await db.query(
      'SELECT i.kind,i.status,f.user_id,f.mime,f.size FROM item i JOIN source_file f ON f.item_id=i.id AND f.user_id=i.user_id WHERE i.id=$1',
      [first.item.id],
    );
    assert.deepEqual(saved, {
      kind: 'image',
      status: 'ready',
      user_id: 'reader',
      mime: 'image/png',
      size: png.length,
    });
    const duplicate = await capture(
      'reader',
      { kind: 'article', url: 'https://example.org/picture.png' },
      'web',
      db,
    );
    assert.equal(duplicate.item.id, first.item.id);
    assert.equal(
      (await db.query('SELECT item_id FROM source_file WHERE user_id=$1', ['other'])).rows.length,
      0,
    );
    const stale = await capture(
      'reader',
      { kind: 'article', url: 'https://example.org/stale.png' },
      'web',
      db,
    );
    await processNext(
      db,
      async () => {
        await db.query("UPDATE import_job SET lock_token='reclaimed' WHERE item_id=$1", [
          stale.item.id,
        ]);
        return result();
      },
      'reader',
    );
    assert.equal(
      (await db.query('SELECT item_id FROM source_file WHERE item_id=$1', [stale.item.id])).rows
        .length,
      0,
    );
    const oversized = await capture(
      'reader',
      { kind: 'article', url: 'https://example.org/large.png' },
      'web',
      db,
    );
    await processNext(
      db,
      async () => {
        const r = result();
        r.image!.data = Buffer.concat([png, Buffer.alloc(maximumUploadBytes())]);
        return r;
      },
      'reader',
    );
    assert.equal(
      (await db.query('SELECT status FROM item WHERE id=$1', [oversized.item.id])).rows[0].status,
      'failed',
    );
    assert.equal(
      (await db.query('SELECT item_id FROM source_file WHERE item_id=$1', [oversized.item.id])).rows
        .length,
      0,
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
