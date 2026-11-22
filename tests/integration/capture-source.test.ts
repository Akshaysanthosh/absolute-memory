import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { captureSource } from '../../src/server/services/capture-source';
import { listLibraryItems } from '../../src/server/services/library-search';
import { MediaError } from '../../src/shared/media/transcript';
import type { Episode } from '../../src/server/services/media/podcast';
test('generic capture routes exact podcast episodes without scraping page text, preserves duplicates and tenant scope', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  const episode: Episode = {
    id: 'a'.repeat(64),
    title: 'A public episode',
    author: 'Example show',
    audioUrl: 'https://example.org/episode.mp3',
    transcriptUrl: 'https://example.org/transcript.vtt',
    duration: 60,
  };
  const url = 'https://open.spotify.com/episode/1234567890123456789012',
    resolve = async () => [episode];
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('source-a','A','sa@test.invalid'),('source-b','B','sb@test.invalid')`,
    );
    const a = await captureSource(
      'source-a',
      { kind: 'article', url, captured: { html: 'Not the spoken episode' } },
      'extension',
      db,
      resolve,
    );
    assert.equal(a.item.channel, 'extension');
    assert.equal(a.item.status, 'pending');
    assert.equal(a.item.domain, 'Podcast');
    assert.equal(
      (await db.query('SELECT kind FROM media_source WHERE item_id=$1', [a.item.id])).rows[0].kind,
      'podcast',
    );
    const again = await captureSource(
      'source-a',
      { kind: 'article', url },
      'extension',
      db,
      resolve,
    );
    assert.equal(again.item.id, a.item.id);
    assert.equal(again.duplicate, true);
    const b = await captureSource('source-b', { kind: 'article', url }, 'extension', db, resolve);
    assert.notEqual(b.item.id, a.item.id);
    const items = await listLibraryItems('source-a', db);
    assert.equal(items.length, 1);
    assert.equal(items[0].media_url, episode.audioUrl);
    await assert.rejects(
      captureSource(
        'source-a',
        { kind: 'article', url: 'https://podcasts.apple.com/us/podcast/example/id123' },
        'extension',
        db,
        resolve,
      ),
      /specific podcast episode/,
    );
    await assert.rejects(
      captureSource('source-a', { kind: 'article', url }, 'extension', db, async () => [
        episode,
        episode,
      ]),
      /does not identify one/,
    );
    await assert.rejects(
      captureSource('source-a', { kind: 'article', url }, 'extension', db, async () => {
        throw new MediaError('No public episode found');
      }),
      /No public episode found/,
    );
    const note = await captureSource(
      'source-a',
      { kind: 'note', title: 'Normal note', text: 'The ordinary capture path stays readable.' },
      'web',
      db,
      resolve,
    );
    assert.equal(note.item.status, 'ready');
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('podcast repair keeps a failed legacy item and rejects its stale article completion', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  const { randomUUID } = await import('node:crypto'),
    { processNext } = await import('../../src/server/jobs/worker'),
    { extractSavedPage } = await import('../../src/server/services/extract');
  const id = randomUUID(),
    url = 'https://open.spotify.com/episode/1234567890123456789012';
  const episode: Episode = {
    id: 'b'.repeat(64),
    title: 'Resolved public episode',
    author: 'Example show',
    audioUrl: 'https://example.org/audio.mp3',
    transcriptUrl: null,
    duration: 60,
  };
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    began = new Promise<void>((r) => (started = r));
  try {
    await db.query(`INSERT INTO "user"(id,name,email) VALUES('legacy','L','legacy@test.invalid')`);
    await db.query(
      "INSERT INTO item(id,user_id,kind,title,url,status) VALUES($1,'legacy','article','Failed old article',$2,'failed')",
      [id, url],
    );
    await db.query('INSERT INTO import_job(id,item_id) VALUES($1,$2)', [randomUUID(), id]);
    const stale = processNext(
      db,
      async () => {
        started();
        await gate;
        return extractSavedPage(
          '<title>Stale page</title><article><h1>Stale page</h1>' +
            '<p>This page is old website text rather than the podcast transcript. It must never replace the selected public episode after the capture repair finishes.</p>'.repeat(
              8,
            ) +
            '</article>',
          url,
        );
      },
      'legacy',
    );
    await began;
    const repaired = await captureSource(
      'legacy',
      { kind: 'article', url },
      'extension',
      db,
      async () => [episode],
    );
    assert.equal(repaired.item.id, id);
    assert.equal(repaired.duplicate, true);
    assert.equal(repaired.item.title, episode.title);
    release();
    await stale;
    const row = (
      await db.query<{ title: string; status: string }>(
        'SELECT title,status FROM item WHERE id=$1',
        [id],
      )
    ).rows[0];
    assert.equal(row.title, episode.title);
    assert.equal(row.status, 'pending');
    const job = (
      await db.query<{ state: string; lock_token: string | null }>(
        'SELECT state,lock_token FROM import_job WHERE item_id=$1',
        [id],
      )
    ).rows[0];
    assert.equal(job.state, 'queued');
    assert.equal(job.lock_token, null);
  } finally {
    release?.();
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
