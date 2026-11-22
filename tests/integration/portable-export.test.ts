import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import { saveDocument } from '../../src/server/services/documents';
import { createCanvas } from '@napi-rs/canvas';
import { getStorage } from '../../src/server/providers';
import { getHighlights, insertHighlight } from '../../src/server/repos/reading';
import { replaceReadingImages } from '../../src/server/repos/reading-images';
import { readArticleImage } from '../../src/server/services/import/images';
import { plainReading } from '../../src/server/services/import/content';
import { readDocument } from '../../src/server/services/document-assets';
import {
  bufferReadable,
  withUnpackedArchive,
  zipFiles,
} from '../../src/server/services/transfers/archive';
import { transferLimits } from '../../src/server/services/transfers/limits';
import { exportLibrary } from '../../src/server/services/transfers/export';
import { manifestSchema } from '../../src/server/services/transfers/format';
import {
  downloadTransfer,
  listTransfers,
  processTransfer,
  queueExport,
  queueImport,
} from '../../src/server/services/transfers/jobs';
import { importPortableLibrary } from '../../src/server/services/transfers/portable-import';

const quote = 'The source explains a lasting technique.';

async function temporaryLibrary() {
  process.env.AM_TEST_DB = 'memory';
  const old = process.env.DATA_DIR;
  const directory = await mkdtemp(join(tmpdir(), 'absolute-memory-export-fixture-'));
  process.env.DATA_DIR = directory;
  const db = await createDatabase();
  await db.query(
    `INSERT INTO "user"(id,name,email) VALUES('sender','Sender','sender@example.invalid'),('receiver','Receiver','receiver@example.invalid')`,
  );
  return {
    db,
    async close() {
      await db.close();
      if (old === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = old;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('portable export and import preserve account data, originals, saved citations, and repeat safely', async () => {
  const handle = await temporaryLibrary();
  const { db } = handle;
  try {
    const save = await capture(
      'sender',
      { kind: 'note', title: 'Techniques', text: quote },
      'web',
      db,
    );
    await capture(
      'receiver',
      {
        kind: 'note',
        title: 'Other owner private fixture',
        text: 'This account owns a different item.',
      },
      'web',
      db,
    );
    const pdf = await readFile(new URL('../fixtures/dummy.pdf', import.meta.url));
    await saveDocument(
      'sender',
      'Research.pdf',
      pdf,
      {
        ...plainReading('PDF reading content'),
        pages: 1,
        mime: 'application/pdf',
        method: 'text',
        suggestedTitle: undefined,
      },
      db,
    );
    const segments = [{ passageIndex: 0, start: 0, end: quote.length, text: quote }];
    const item = save.item.id;
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'b0' },
          content: [{ type: 'text', text: quote, marks: [{ type: 'italic' }] }],
        },
      ],
    };
    await db.query('INSERT INTO note_document(item_id,document,version) VALUES($1,$2::jsonb,2)', [
      item,
      JSON.stringify(doc),
    ]);
    await insertHighlight(db, 'sender', item, randomUUID(), quote, segments);
    await insertHighlight(
      db,
      'sender',
      item,
      randomUUID(),
      'An imported quote without matching text.',
      [],
    );
    const image = await createCanvas(8, 8).encode('png');
    const key = `reading-images/${randomUUID()}`;
    await getStorage().put(key, image, 'image/png');
    await db.transaction(async (tx) => {
      await replaceReadingImages(tx, 'sender', item, [
        { slot: 0, object_key: key, mime: 'image/png', size: image.length },
      ]);
      await tx.query(
        `UPDATE item SET reading_html=reading_html||$2, source_details=jsonb_build_object('thumbnailUrl',$3::text)
        WHERE id=$1 AND user_id='sender'`,
        [
          item,
          `<figure><img src="/api/items/${item}/reading-images/0" alt="Fixture"></figure>`,
          `/api/items/${item}/reading-images/0`,
        ],
      );
    });
    await db.query(
      `INSERT INTO knowledge_tag(user_id,item_id,name,origin) VALUES('sender',$1,'research','manual')`,
      [item],
    );
    const thread = randomUUID();
    await db.query(
      `INSERT INTO library_thread(id,user_id,title) VALUES($1,'sender','Research question')`,
      [thread],
    );
    await db.query(
      `INSERT INTO library_turn(id,user_id,thread_id,request_id,question,answer,state,sources,model)
      VALUES($1,'sender',$2,$3,'How does it work?','A cited claim [1].','complete',$4::jsonb,'fixture')`,
      [
        randomUUID(),
        thread,
        randomUUID(),
        JSON.stringify([
          { type: 'saved', key: '1', itemId: item, title: 'Techniques', passageIndex: 0, quote },
        ]),
      ],
    );

    const queued = await queueExport('sender', db);
    assert.equal(await processTransfer(db, 'sender'), true);
    await assert.rejects(downloadTransfer('receiver', queued, db), /unavailable/);
    const archive = await bufferReadable(
      await downloadTransfer('sender', queued, db),
      transferLimits().uploadBytes,
    );
    const files = await withUnpackedArchive(
      archive,
      () => true,
      async (unpacked) => {
        const entries = new Map<string, Buffer>();
        for (const name of unpacked.entries.keys()) entries.set(name, (await unpacked.read(name))!);
        return entries;
      },
    );
    const manifest = manifestSchema.parse(JSON.parse(files.get('manifest.json')!.toString()));
    assert.deepEqual(manifest.counts, {
      items: 2,
      highlights: 2,
      notes: 1,
      chats: 1,
      files: 1,
      reading_images: 1,
    });
    assert.equal(
      files.get('items.jsonl')?.toString().includes('Other owner private fixture'),
      false,
    );
    assert.equal(files.get('items.jsonl')?.toString().includes('user_id'), false);
    assert.equal(files.get('items.jsonl')?.toString().includes('object_key'), false);
    assert.ok(
      [...files].some(
        ([name, body]) => name.startsWith('markdown/') && body.toString().includes(`> ${quote}`),
      ),
    );

    const restore = await queueImport('receiver', 'absolute-memory', Readable.from([archive]), db);
    assert.equal(await processTransfer(db, 'receiver'), true);
    const transfer = (await listTransfers('receiver', db)).find((job) => job.id === restore);
    assert.deepEqual(
      { state: transfer?.state, count: transfer?.imported },
      { state: 'ready', count: 2 },
    );
    const {
      rows: [restored],
    } = await db.query<{
      id: string;
      document: unknown;
      version: number;
      reading_html: string;
      tag: string;
    }>(
      `
      SELECT i.id,n.document,n.version,i.reading_html,t.name AS tag FROM item i
      JOIN note_document n ON n.item_id=i.id JOIN knowledge_tag t ON t.item_id=i.id AND t.user_id=i.user_id
      WHERE i.user_id='receiver'`,
      [],
    );
    assert.notEqual(restored?.id, item);
    assert.deepEqual(
      { document: restored.document, version: restored.version, tag: restored.tag },
      { document: doc, version: 2, tag: 'research' },
    );
    const marks = await getHighlights(db, 'receiver', {
      itemId: restored.id,
      limit: 10,
      offset: 0,
    });
    assert.deepEqual(marks.find((mark) => mark.quote === quote)?.segments, segments);
    assert.deepEqual(marks.find((mark) => mark.quote !== quote)?.segments, []);
    assert.ok(restored.reading_html.includes(`/api/items/${restored.id}/reading-images/0`));
    assert.deepEqual(
      Buffer.from((await readArticleImage('receiver', restored.id, 0, db))!.bytes),
      image,
    );
    assert.equal(await readArticleImage('sender', restored.id, 0, db), null);
    const {
      rows: [chat],
    } = await db.query<{ sources: { itemId: string; passageIndex: number }[]; answer: string }>(
      `SELECT sources,answer FROM library_turn WHERE user_id='receiver'`,
    );
    assert.equal(chat.sources[0].itemId, restored.id);
    assert.equal(chat.sources[0].passageIndex, 0);
    assert.equal(chat.answer, 'A cited claim [1].');
    const {
      rows: [original],
    } = await db.query<{ id: string }>(
      `SELECT id FROM item WHERE user_id='receiver' AND kind='pdf'`,
    );
    assert.deepEqual((await readDocument('receiver', original.id, db)).data, pdf);
    assert.deepEqual(await importPortableLibrary('receiver', archive, db), {
      created: 0,
      duplicates: 2,
    });
    assert.equal(
      (await db.query(`SELECT id FROM library_turn WHERE user_id='receiver'`)).rows.length,
      1,
    );
    assert.equal(
      (await db.query(`SELECT id FROM highlight WHERE user_id='receiver'`)).rows.length,
      2,
    );
    assert.equal(
      (await bufferReadable(await exportLibrary('receiver', db), transferLimits().uploadBytes))
        .subarray(0, 2)
        .toString(),
      'PK',
    );
  } finally {
    await handle.close();
  }
});

test('legacy transfers resume at their committed cursor after interruption', async () => {
  const handle = await temporaryLibrary();
  const { db } = handle;
  try {
    const links = Array.from(
      { length: 105 },
      (_, index) => `https://example.org/items/${index},Item ${index},research,1609459200,unread`,
    );
    const csv = Buffer.from(['url,title,tags,time_added,status', ...links].join('\n'));
    const id = await queueImport('receiver', 'pocket', Readable.from([csv]), db);
    assert.equal(await processTransfer(db, 'receiver'), true);
    const [first] = await listTransfers('receiver', db);
    assert.equal(first.processed, 100);
    assert.equal(first.state, 'queued');
    await db.query(
      `UPDATE transfer_job SET state='running',lease=gen_random_uuid(),heartbeat_at=now()-interval '6 minutes' WHERE id=$1`,
      [id],
    );
    assert.equal(await processTransfer(db, 'receiver'), true);
    const [completed] = await listTransfers('receiver', db);
    assert.equal(completed.processed, 105);
    assert.equal(completed.imported, 105);
    assert.equal(completed.state, 'ready');
    const {
      rows: [result],
    } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM item WHERE user_id='receiver' AND created_at='2021-01-01T00:00:00Z'`,
    );
    assert.equal(result.count, 105);
    assert.equal(await processTransfer(db, 'receiver'), false);
  } finally {
    await handle.close();
  }
});

test('each member can reserve one import and one export at a time', async () => {
  const handle = await temporaryLibrary();
  const { db } = handle;
  try {
    const exports = await Promise.allSettled([
      queueExport('sender', db),
      queueExport('sender', db),
    ]);
    assert.equal(exports.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
      exports.filter((result) => result.status === 'rejected' && result.reason.status === 409)
        .length,
      1,
    );
    const data = Buffer.from('url,title\nhttps://example.test/article,An article\n');
    const imports = await Promise.allSettled([
      queueImport('sender', 'pocket', Readable.from([data]), db),
      queueImport('sender', 'pocket', Readable.from([data]), db),
    ]);
    assert.equal(imports.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
      imports.filter((result) => result.status === 'rejected' && result.reason.status === 409)
        .length,
      1,
    );
    assert.equal((await listTransfers('sender', db)).length, 2);
    assert.ok(await queueExport('receiver', db));
  } finally {
    await handle.close();
  }
});

test('uploads and expanded archives enforce configured byte limits and release failed reservations', async (t) => {
  const handle = await temporaryLibrary();
  const { db } = handle;
  const previousUpload = process.env.TRANSFER_MAX_UPLOAD_MB;
  const previousExpanded = process.env.TRANSFER_MAX_EXPANDED_MB;
  t.after(() => {
    if (previousUpload === undefined) delete process.env.TRANSFER_MAX_UPLOAD_MB;
    else process.env.TRANSFER_MAX_UPLOAD_MB = previousUpload;
    if (previousExpanded === undefined) delete process.env.TRANSFER_MAX_EXPANDED_MB;
    else process.env.TRANSFER_MAX_EXPANDED_MB = previousExpanded;
  });
  try {
    process.env.TRANSFER_MAX_UPLOAD_MB = '1';
    process.env.TRANSFER_MAX_EXPANDED_MB = '1';
    const chunk = Buffer.alloc(600_000, 65);
    await assert.rejects(queueImport('sender', 'pocket', Readable.from([chunk, chunk]), db), {
      status: 413,
    });
    const archive = await bufferReadable(
      zipFiles([
        ['one.csv', chunk],
        ['two.csv', chunk],
      ]),
      transferLimits().uploadBytes,
    );
    await assert.rejects(
      withUnpackedArchive(
        archive,
        () => true,
        async () => {},
      ),
      { status: 413 },
    );
    const accepted = await queueImport(
      'sender',
      'pocket',
      Readable.from([Buffer.from('url,title\nhttps://example.test/article,An article\n')]),
      db,
    );
    assert.ok(accepted);
  } finally {
    await handle.close();
  }
});
