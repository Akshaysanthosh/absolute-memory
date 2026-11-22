import { maximumUploadBytes } from '../../src/server/config';
import { readDocument } from '../../src/server/services/document-assets';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileType, extractDocument, saveDocument } from '../../src/server/services/documents';
import { createDatabase } from '../../src/server/db';
import { getDocumentProxy, renderPageAsImage } from 'unpdf';
import { configureTemporaryStorage } from '../fixtures/storage';
configureTemporaryStorage();

test('file detection rejects HTML/SVG disguised as an image', () => {
  assert.throws(() => fileType(Buffer.from('<svg onload="alert(1)">')), /Choose a PDF/);
  assert.equal(fileType(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(fileType(new Uint8Array([255, 216, 255, 224])), 'image/jpeg');
});
test('PDF text extraction, original persistence, storage bounds, rendering and deletion', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [
      'doc',
      'Doc',
      'doc@test.invalid',
    ]);
    const bytes = new Uint8Array(await readFile('tests/fixtures/dummy.pdf'));
    const extracted = await extractDocument(
      bytes,
      'Example.pdf',
      false,
      'doc',
      AbortSignal.timeout(20000),
      db,
    );
    assert.equal(extracted.pages, 1);
    assert.match(extracted.passages.map((b) => b.text).join(' '), /Dummy PDF file/);
    assert.equal(extracted.method, 'text');
    const id = await saveDocument('doc', 'Example.pdf', bytes, extracted, db);
    const saved = await readDocument('doc', id, db);
    assert.deepEqual(new Uint8Array(saved.data), bytes);
    assert.equal(saved.mime, 'application/pdf');
    await assert.rejects(
      saveDocument('doc', 'Too big.pdf', new Uint8Array(maximumUploadBytes() + 1), extracted, db),
    );
    const pdf = await getDocumentProxy(bytes.slice(), { maxImageSize: 16777216 });
    try {
      const png = await renderPageAsImage(pdf, 1, {
        canvasImport: () => import('@napi-rs/canvas'),
        scale: 0.5,
      });
      assert.equal(fileType(new Uint8Array(png as ArrayBuffer)), 'image/png');
    } finally {
      await pdf.loadingTask.destroy();
    }
    await db.query('DELETE FROM item WHERE id=$1', [id]);
    assert.equal((await db.query('SELECT * FROM source_file')).rows.length, 0);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
