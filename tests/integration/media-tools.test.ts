import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createDatabase } from '../../src/server/db';
import { processNext } from '../../src/server/jobs/worker';
import { getStorage } from '../../src/server/providers';
import { maintainDocumentAssets } from '../../src/server/services/document-assets';
import { stitchAudioSegments } from '../../src/server/services/media/audio';
import { withMediaDirectory } from '../../src/server/services/media/tools';
import { saveMediaUpload } from '../../src/server/services/media/upload';
import {
  captionLanguages,
  videoCaptions,
  videoMetadata,
} from '../../src/server/services/media/video';
import { startMockProvider } from '../fixtures/mock-provider/server';

function setEnvironment(t: TestContext, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

async function fakeTool(directory: string, name: string, script: string) {
  await writeFile(join(directory, name), '#!/usr/bin/env node\n' + script, { mode: 0o700 });
}

test('caption preference chooses language, then English, then other published tracks', () => {
  const info = {
    subtitles: { fr: [], de: [], en: [], live_chat: [] },
    automatic_captions: { 'en-US': [], ja: [], '.*': [] },
  };
  assert.deepEqual(captionLanguages(info, 'ja'), ['ja', 'en', 'en-US', 'fr', 'de']);
});

test('yt-dlp caption fixture is parsed with source timestamps and without downloading audio', async (t) => {
  await withMediaDirectory(async (directory) => {
    setEnvironment(t, {
      PATH: directory + delimiter + process.env.PATH,
      MEDIA_ENABLED: 'true',
      ALLOW_PRIVATE_NETWORK_FETCH: 'true',
    });
    await fakeTool(
      directory,
      'yt-dlp',
      `
      const args = process.argv.slice(2);
      if (!args.includes('--proxy') || !args.includes('--skip-download')) process.exit(2);
      if (args.includes('--dump-single-json')) {
        console.log(JSON.stringify({title:'A captioned fixture', duration:12, subtitles:{en:[{ext:'vtt'}]}}));
      } else if (args.includes('--write-subs') && args.includes('^en$')) {
        require('node:fs').writeFileSync('caption.en.vtt', 'WEBVTT\\n\\n00:00:01.250 --> 00:00:02.500\\nThe published caption.\\n');
      }
    `,
    );
    const url = 'https://127.0.0.1/fixture';
    const info = await videoMetadata(url, directory);
    assert.equal(info.title, 'A captioned fixture');
    assert.deepEqual(await videoCaptions(url, directory, info), {
      lang: 'en',
      content: [{ text: 'The published caption.', offset: 1250, duration: 1250 }],
    });
  });
});

test('uploaded audio is queued, deduplicated, transcribed and cleaned up through storage', async (t) => {
  const fixture = await startMockProvider();
  t.after(fixture.close);
  await withMediaDirectory(async (directory) => {
    setEnvironment(t, {
      PATH: directory + delimiter + process.env.PATH,
      AM_TEST_DB: 'memory',
      DATA_DIR: directory,
      TRANSCRIPTION_BASE_URL: fixture.baseURL,
      TRANSCRIPTION_MODEL: 'fixture',
    });
    await fakeTool(
      directory,
      'ffmpeg',
      `
      const args = process.argv.slice(2);
      if (!args.includes('-protocol_whitelist') || !args.includes('16000') || !args.includes('s16le')) process.exit(2);
      require('node:fs').writeFileSync(args.at(-1), Buffer.alloc(64000));
    `,
    );
    const db = await createDatabase();
    try {
      await db.query(
        `INSERT INTO "user"(id,name,email) VALUES('media-a','A','a@example.invalid'),('media-b','B','b@example.invalid')`,
      );
      const content = Buffer.from('local fixture audio');
      const a = await saveMediaUpload('media-a', 'Interview.wav', content, db);
      assert.deepEqual(await saveMediaUpload('media-a', 'Interview.wav', content, db), {
        id: a.id,
        duplicate: true,
      });
      const b = await saveMediaUpload('media-b', 'Interview.wav', content, db);
      assert.notEqual(a.id, b.id);
      const source = async (id: string) =>
        (
          await db.query<{ audio_object_key: string | null; segments: unknown[]; stage: string }>(
            'SELECT audio_object_key,segments,stage FROM media_source WHERE item_id=$1',
            [id],
          )
        ).rows[0];
      const key = (await source(a.id)).audio_object_key!;
      assert.equal(await getStorage().exists(key), true);
      assert.equal(await processNext(db, undefined, 'media-a'), true);
      assert.deepEqual(await source(a.id), {
        audio_object_key: null,
        stage: 'complete',
        segments: [{ text: 'A local fixture transcript', offset: 1000, duration: 1000 }],
      });
      const {
        rows: [reading],
      } = await db.query<{ passages: unknown[]; reading_html: string }>(
        'SELECT passages,reading_html FROM item WHERE id=$1',
        [a.id],
      );
      assert.deepEqual(reading.passages, [
        { index: 0, text: 'A local fixture transcript', startMs: 1000, endMs: 2000 },
      ]);
      assert.match(reading.reading_html, /id="p-0".*A local fixture transcript/);
      assert.equal((await source(b.id)).stage, 'native');
      await db.query('UPDATE document_asset_cleanup SET available_at=now()');
      await maintainDocumentAssets(db);
      assert.equal(await getStorage().exists(key), false);
      assert.equal(await getStorage().exists((await source(b.id)).audio_object_key!), true);
    } finally {
      await db.close();
    }
  });
});

test('audio chunk stitching maps timestamps and removes segments in the leading overlap', () => {
  assert.deepEqual(
    stitchAudioSegments(
      [
        { text: 'Overlap', offset: 0, duration: 500 },
        { text: 'New', offset: 1700, duration: 1100 },
      ],
      598_000,
      600_000,
      2000,
    ),
    [{ text: 'New', offset: 599_700, duration: 300 }],
  );
});
