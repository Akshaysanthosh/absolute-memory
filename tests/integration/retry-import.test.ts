import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import { retryImport } from '../../src/server/services/retry-import';
import { MediaError } from '../../src/shared/media/transcript';

test('explicit retry repairs a legacy podcast URL in place and refuses cross-owner access', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('retry-owner','A','retry-owner@test.invalid'),('retry-other','B','retry-other@test.invalid')`,
    );
    const id = randomUUID(),
      url = 'https://open.spotify.com/episode/1234567890123456789012';
    await db.query(
      "INSERT INTO item(id,user_id,kind,title,url,status,error) VALUES($1,'retry-owner','article','Legacy podcast',$2,'failed','HTTP 403')",
      [id, url],
    );
    await db.query("INSERT INTO import_job(id,item_id,state,attempts) VALUES($1,$2,'failed',3)", [
      randomUUID(),
      id,
    ]);
    let calls = 0;
    const resolve = async () => {
      calls++;
      return [
        {
          id: 'exact-episode',
          title: 'Resolved episode',
          author: 'Example show',
          audioUrl: 'https://example.org/episode.mp3',
          transcriptUrl: 'https://example.org/episode.vtt',
          duration: 120,
        },
      ];
    };
    await assert.rejects(retryImport('retry-other', id, db, resolve), /not found/);
    assert.equal(calls, 0);
    await retryImport('retry-owner', id, db, resolve);
    assert.equal(calls, 1);
    const row = (await db.query('SELECT title,status,error FROM item WHERE id=$1', [id])).rows[0];
    assert.equal(row.title, 'Resolved episode');
    assert.equal(row.status, 'pending');
    assert.equal(row.error, null);
    assert.equal(
      (await db.query('SELECT kind FROM media_source WHERE item_id=$1', [id])).rows[0].kind,
      'podcast',
    );
    assert.equal(
      (await db.query('SELECT attempts,state FROM import_job WHERE item_id=$1', [id])).rows[0]
        .attempts,
      0,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS count FROM item WHERE user_id='retry-owner'"))
        .rows[0].count,
      1,
    );
    const duplicate = randomUUID();
    await db.query(
      "INSERT INTO item(id,user_id,kind,title,url,status) VALUES($1,'retry-owner','article','Older duplicate','https://open.spotify.com/episode/3234567890123456789012','failed')",
      [duplicate],
    );
    await assert.rejects(retryImport('retry-owner', duplicate, db, resolve), /already saved as/);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM media_source WHERE user_id='retry-owner'",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('unresolved podcast retries retain a specific failure, and ordinary retries keep their existing pipeline', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('retry-source','A','retry-source@test.invalid')`,
    );
    const legacy = randomUUID();
    await db.query(
      "INSERT INTO item(id,user_id,kind,title,url,status,error) VALUES($1,'retry-source','article','Legacy podcast','https://open.spotify.com/episode/1234567890123456789012','failed','Original error')",
      [legacy],
    );
    await assert.rejects(
      retryImport('retry-source', legacy, db, async () => {
        throw new MediaError('Exact episode unavailable; use its RSS feed.');
      }),
      /Exact episode unavailable/,
    );
    assert.equal(
      (await db.query('SELECT status,error FROM item WHERE id=$1', [legacy])).rows[0].error,
      'Exact episode unavailable; use its RSS feed.',
    );
    const saved = await capture(
      'retry-source',
      { kind: 'article', url: 'https://example.org/article' },
      'web',
      db,
    );
    await db.query("UPDATE item SET status='failed',error='Temporary outage' WHERE id=$1", [
      saved.item.id,
    ]);
    await db.query("UPDATE import_job SET state='failed',attempts=3 WHERE item_id=$1", [
      saved.item.id,
    ]);
    await retryImport('retry-source', saved.item.id, db);
    assert.equal(
      (await db.query('SELECT status,error FROM item WHERE id=$1', [saved.item.id])).rows[0].status,
      'pending',
    );
    assert.equal(
      (await db.query('SELECT state FROM import_job WHERE item_id=$1', [saved.item.id])).rows[0]
        .state,
      'queued',
    );
    const removed = randomUUID();
    await db.query(
      "INSERT INTO item(id,user_id,kind,title,url,status) VALUES($1,'retry-source','article','Deleted during retry','https://open.spotify.com/episode/2234567890123456789012','failed')",
      [removed],
    );
    await assert.rejects(
      retryImport('retry-source', removed, db, async () => {
        await db.query('DELETE FROM item WHERE id=$1', [removed]);
        return [
          {
            id: 'removed-episode',
            title: 'Removed episode',
            author: 'Example show',
            audioUrl: 'https://example.org/removed.mp3',
            transcriptUrl: null,
            duration: 120,
          },
        ];
      }),
      /not found/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT id FROM item WHERE user_id='retry-source' AND url='https://open.spotify.com/episode/2234567890123456789012'",
        )
      ).rows.length,
      0,
      'Retry must not recreate a deleted item',
    );
    const ready = await capture(
      'retry-source',
      { kind: 'note', title: 'Read now', text: 'Existing readable content.' },
      'web',
      db,
    );
    await retryImport('retry-source', ready.item.id, db);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('explicit retry repairs legacy social articles in place without crossing ownership', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('social-retry','A','social-retry@test.invalid'),('social-other','B','social-other@test.invalid')`,
    );
    const id = randomUUID();
    await db.query(
      "INSERT INTO item(id,user_id,kind,title,url,status,error) VALUES($1,'social-retry','article','Saved reel','https://instagram.com/reel/LEGACY/','failed','HTTP 403')",
      [id],
    );
    await db.query("INSERT INTO import_job(id,item_id,state,attempts) VALUES($1,$2,'failed',3)", [
      randomUUID(),
      id,
    ]);
    await assert.rejects(retryImport('social-other', id, db), /not found/);
    assert.equal(
      (await db.query('SELECT item_id FROM media_source WHERE item_id=$1', [id])).rows.length,
      0,
    );
    await retryImport('social-retry', id, db);
    const item = (await db.query('SELECT status,source_details FROM item WHERE id=$1', [id]))
      .rows[0];
    assert.equal(item.status, 'pending');
    assert.equal(
      (item.source_details as { social: { platform: string } }).social.platform,
      'Instagram',
    );
    const media = (await db.query('SELECT kind,stage FROM media_source WHERE item_id=$1', [id]))
      .rows[0];
    assert.equal(media.kind, 'social');
    assert.equal(media.stage, 'metadata');
    assert.equal(
      (await db.query('SELECT state FROM import_job WHERE item_id=$1', [id])).rows[0].state,
      'queued',
    );
    await retryImport('social-retry', id, db);
    assert.equal(
      (await db.query('SELECT item_id FROM media_source WHERE item_id=$1', [id])).rows.length,
      1,
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
