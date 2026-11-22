import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/server/db';
import {
  documentDigest,
  maintainDocumentAssets,
  readDocument,
  storeOriginal,
} from '../../src/server/services/document-assets';
import { getStorage, readStorageBytes } from '../../src/server/providers';
import { configureTemporaryStorage } from '../fixtures/storage';

configureTemporaryStorage();

test('originals are streamed from local storage and removed when the owned item is deleted', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  const itemId = randomUUID();
  const data = Buffer.from('a saved file');
  const storage = getStorage();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('owner','A','a@example.test'),('other','B','b@example.test')`,
    );
    await db.query("INSERT INTO item(id,user_id,kind,title) VALUES($1,'owner','pdf','Document')", [
      itemId,
    ]);
    const attach = await storeOriginal(
      db,
      'owner',
      itemId,
      {
        name: 'original.pdf',
        mime: 'application/pdf',
        pages: 1,
        method: 'test',
        data,
      },
      storage,
    );
    await db.transaction(attach);
    const file = await readDocument('owner', itemId, db, storage);
    assert.equal(file.digest, documentDigest(data));
    assert.deepEqual(file.data, data);
    assert.equal(await storage.exists(file.object_key), true);
    await assert.rejects(readStorageBytes(storage, file.object_key, 2), /recorded size/);
    await assert.rejects(readDocument('other', itemId, db, storage), /not found/);
    assert.equal(
      (
        await db.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='source_file' AND data_type='bytea'",
        )
      ).rows.length,
      0,
    );
    await db.query('DELETE FROM item WHERE id=$1', [itemId]);
    await db.query('UPDATE document_asset_cleanup SET available_at=now()');
    assert.deepEqual(await maintainDocumentAssets(db, storage), { deleted: 1, failed: 0 });
    assert.equal(await storage.exists(file.object_key), false);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('expired staged objects are reclaimed when an import loses its lease before committing', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  const storage = getStorage();
  try {
    await storeOriginal(
      db,
      'owner',
      randomUUID(),
      {
        name: 'orphan.pdf',
        mime: 'application/pdf',
        pages: 1,
        method: 'test',
        data: Buffer.from('orphan'),
      },
      storage,
    );
    const {
      rows: [{ object_key }],
    } = await db.query<{ object_key: string }>(
      'UPDATE document_asset_cleanup SET available_at=now() RETURNING object_key',
    );
    assert.equal(await storage.exists(object_key), true);
    assert.deepEqual(await maintainDocumentAssets(db, storage), { deleted: 1, failed: 0 });
    assert.equal(await storage.exists(object_key), false);
    await assert.rejects(storage.get('../escape'), /Invalid storage key/);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
