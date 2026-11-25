import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createDatabase } from '../src/server/db';
import { runKnowledgeBatch } from '../src/server/jobs/knowledge-worker';
import { processNext } from '../src/server/jobs/worker';
import { readChunkTags } from '../src/server/repos/knowledge-chunks';
import { backdateDemoItem, setDemoThumbnail } from '../src/server/repos/demo-library';
import { readKnowledgeJob } from '../src/server/repos/knowledge-jobs';
import { extractDocument, saveDocument } from '../src/server/services/documents';
import { createInstanceAccount } from '../src/server/services/instance';
import { capture, ownItem } from '../src/server/services/library';
import { savePodcast } from '../src/server/services/media/save-podcast';
import { completeSetup, dismissChecklist } from '../src/server/services/onboarding-setup';
import { createHighlight } from '../src/server/services/reading';
import { removeSamples } from '../src/server/services/samples/seed';
import { findQuote } from '../src/shared/passages';
import { startMockProvider } from '../tests/fixtures/mock-provider/server';
import {
  answer,
  articles,
  citationQuote,
  highlightQuote,
  note,
  summaries,
  transcript,
  transcriptAuthor,
  transcriptImage,
  transcriptTitle,
  videos,
} from './demo-content';
import { demoCallTitle, demoPdf, pdfTitle, seedDemoCall, seedDemoVideo } from './demo-media';

export const demoEmail = 'reader@example.test';

export function demoEnvironment(dataDir: string, appUrl: string, providerUrl: string) {
  return {
    NODE_ENV: 'production',
    APP_URL: appUrl,
    AUTH_SECRET: randomBytes(32).toString('base64url'),
    DATABASE_URL: '',
    DATA_DIR: dataDir,
    ROLE: 'all',
    MIGRATE_ON_START: 'true',
    STORAGE_DRIVER: 'local',
    ALLOW_REMOTE_IMAGES: 'true',
    ALLOW_PRIVATE_NETWORK_FETCH: 'true',
    AI_BASE_URL: providerUrl,
    AI_API_KEY: '',
    AI_MODEL: 'demo-chat',
    EMBEDDINGS_BASE_URL: providerUrl,
    EMBEDDINGS_API_KEY: '',
    EMBEDDINGS_MODEL: 'demo-embedding',
    EMBEDDINGS_DIMENSIONS: '8',
  };
}

export function startDemoProvider() {
  return startMockProvider({
    answer(messages) {
      const system = String(messages.find((message) => message.role === 'system')?.content);
      const prompt = String(messages.at(-1)?.content);
      if (system.includes('library companion')) {
        const { savedPassages } = JSON.parse(prompt) as {
          savedPassages: { number: number; text: string }[];
        };
        const evidence = savedPassages.find(({ text }) => text.includes(citationQuote));
        assert.ok(evidence, 'The demo answer requires the landing passage.');
        return answer(evidence.number);
      }
      // The overview step is plain text: reuse the item's own chunk summary.
      if (prompt.startsWith('Combine these summaries')) return prompt.split('\n\n')[1];
      if (system.includes('Organize only')) {
        const match = summaries.find(([signature]) => prompt.includes(signature));
        assert.ok(match, `No demo summary matches: ${prompt.slice(-120)}`);
        const [, summary, ...tags] = match;
        return JSON.stringify({ summary, tags, entities: [], relationships: [] });
      }
    },
  });
}

/** Fetch each lead image once, so the app saves it from a local source like any article. */
async function demoImages() {
  return Promise.all(
    articles.map(async ({ image, focus }) => {
      const response = await fetch(image, {
        headers: { 'User-Agent': 'absolute-memory-docs-demo/1.0' },
        signal: AbortSignal.timeout(30_000),
      });
      assert.ok(response.ok, `Could not fetch the demo image ${image}: ${response.status}`);
      // A wide crop keeps the reader's opening paragraphs on screen below the lead image.
      const photo = await loadImage(Buffer.from(await response.arrayBuffer()));
      const canvas = createCanvas(1320, 640);
      const scale = 1320 / photo.width;
      const height = photo.height * scale;
      canvas
        .getContext('2d')
        .drawImage(
          photo,
          0,
          -Math.max(0, Math.min(height - 640, height * focus - 320)),
          1320,
          height,
        );
      return canvas.toBuffer('image/jpeg', 88);
    }),
  );
}

async function startDemoSources() {
  const covers = await demoImages();
  const server = createServer((request, response) => {
    const url = request.url;
    const cover = articles.findIndex(({ slug }) => url === `/${slug}.jpg`);
    if (cover >= 0) {
      response.writeHead(200, { 'content-type': 'image/jpeg' }).end(covers[cover]);
      return;
    }
    if (url === '/seed-library.vtt') {
      response.writeHead(200, { 'content-type': 'text/vtt' }).end(transcript);
      return;
    }
    const article = articles.find(({ slug }) => url === `/${slug}`);
    if (!article) {
      response.writeHead(404).end();
      return;
    }
    const { title, author, site, date, slug, sections } = article;
    const text = sections
      .map(
        ([heading, paragraphs]) =>
          (heading ? `<h2>${heading}</h2>` : '') +
          paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(''),
      )
      .join('');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`
      <!doctype html><html lang="en"><head><title>${title}</title>
      <meta name="author" content="${author}">
      <meta property="og:site_name" content="${site}">
      <meta property="og:title" content="${title}">
      <meta property="og:image" content="/${slug}.jpg">
      <meta property="article:published_time" content="${date}">
      </head><body><article><h1>${title}</h1>${text}</article></body></html>
    `);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject).listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

export async function seedDemo(dataDir: string, password: string, highlights = true) {
  assert.equal(process.env.DATA_DIR, dataDir);
  assert.ok(!process.env.DATABASE_URL && !process.env.AM_TEST_DB);
  await mkdir(dataDir);
  const sources = await startDemoSources();
  try {
    const db = await createDatabase();
    try {
      const { id: user } = await createInstanceAccount(
        { name: 'Demo Library', email: demoEmail, password },
        db,
      );
      await removeSamples(user, db);
      await completeSetup(user, {}, db);
      await dismissChecklist(user, db);

      const callId = await seedDemoCall(db, user);
      const { item: savedNote } = await capture(user, { kind: 'note', ...note }, 'web', db);
      const pdf = new Uint8Array(demoPdf());
      const pdfName = `${pdfTitle}.pdf`;
      const parsed = await extractDocument(
        pdf,
        pdfName,
        false,
        user,
        AbortSignal.timeout(20_000),
        db,
      );
      assert.ok(parsed.passages.length, 'The generated PDF must contain readable text.');
      const pdfId = await saveDocument(user, pdfName, pdf, parsed, db);
      const { id: transcriptId } = await savePodcast(
        user,
        {
          episode: {
            id: 'rice-university-1962',
            title: transcriptTitle,
            author: transcriptAuthor,
            audioUrl: `${sources.origin}/rice-university.mp3`,
            transcriptUrl: `${sources.origin}/seed-library.vtt`,
            duration: 1067,
          },
        },
        db,
      );
      await setDemoThumbnail(db, transcriptId, user, transcriptImage);
      const [jobs, altman, karpathy] = await Promise.all(
        videos.map((video) => seedDemoVideo(db, user, video)),
      );
      const articleIds: string[] = [];
      for (const article of articles) {
        const { item } = await capture(
          user,
          { kind: 'article', url: `${sources.origin}/${article.slug}` },
          'web',
          db,
        );
        articleIds.push(item.id);
      }
      const [apollo, hubble] = articleIds;
      // Newest first, as the library shows them, with a day or so between saves.
      const order = [
        jobs,
        apollo,
        altman,
        transcriptId,
        karpathy,
        hubble,
        pdfId,
        savedNote.id,
        callId,
      ];
      for (const [index, id] of order.entries())
        await backdateDemoItem(db, id, user, index * 19 + 2);
      await completeWork(db, user);
      const current = await ownItem(user, articleIds[0], db);
      const recording = await ownItem(user, transcriptId, db);
      assert.ok(recording.passages.some((passage) => passage.startMs != null));
      assert.ok(current.source_details?.thumbnailUrl, 'The lead image must be saved locally.');
      for (const quote of highlights ? [highlightQuote, citationQuote] : []) {
        const segments = findQuote(current.passages, quote);
        assert.ok(segments.length, `Missing demo highlight: ${quote}`);
        await createHighlight(user, current.id, segments, db);
      }
      const ids = order;
      for (const id of ids) {
        const item = await ownItem(user, id, db);
        const {
          rows: [job],
        } = await readKnowledgeJob(db, id, user);
        const { rows: tags } = await readChunkTags(db, id, user);
        assert.ok(
          tags.some(({ tags }) => tags?.length >= 3),
          `Missing mock tags: ${item.title}`,
        );
        assert.equal(item.status, 'ready', item.title);
        assert.ok(job?.summary && job.state === 'ready', `Missing mock summary: ${item.title}`);
      }
      return {
        articleId: current.id,
        titles: [
          ...videos.map(({ title }) => title),
          ...articles.map(({ title }) => title),
          note.title,
          pdfTitle,
          transcriptTitle,
          demoCallTitle,
        ],
      };
    } finally {
      await db.close();
    }
  } finally {
    await sources.close();
  }
}

async function completeWork(db: Awaited<ReturnType<typeof createDatabase>>, user: string) {
  for (let attempts = 0; attempts < 12; attempts++) {
    if (!(await processNext(db, undefined, user))) break;
  }
  for (let attempts = 0; attempts < 12; attempts++) {
    if (!(await runKnowledgeBatch(user, db))) break;
  }
}

async function main() {
  const [dataDir, appUrl] = process.argv.slice(2);
  const password = process.env.AM_DEMO_PASSWORD;
  if (!dataDir || !appUrl || !password || password.length < 10)
    throw new Error(
      'Set AM_DEMO_PASSWORD (10 or more characters) and pass a new data directory and local app URL.',
    );
  const provider = await startDemoProvider();
  try {
    const env = demoEnvironment(dataDir, appUrl, provider.baseURL);
    delete process.env.AM_TEST_DB;
    Object.assign(process.env, env);
    const demo = await seedDemo(dataDir, password);
    console.log(`Seeded ${demo.titles.length} demo items. Sign in as ${demoEmail} at ${appUrl}.`);
  } finally {
    await provider.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
