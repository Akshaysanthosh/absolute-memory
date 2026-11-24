import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../src/server/db';
import { runKnowledgeBatch } from '../src/server/jobs/knowledge-worker';
import { processNext } from '../src/server/jobs/worker';
import { readChunkTags } from '../src/server/repos/knowledge-chunks';
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
  articles,
  citationQuote,
  highlightQuote,
  note,
  transcript,
  transcriptTitle,
} from './demo-content';
import { demoCallTitle, demoCover, demoPdf, pdfTitle, seedDemoCall } from './demo-media';

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

const summaries = [
  [
    'A week of paired roof readings exposed how long unshaded gravel holds heat.',
    'Libraries',
    'Fieldwork',
    'Urban climate',
  ],
  [
    'Two rain gauges showed how walls and wind change a small garden’s rainfall readings.',
    'Fieldwork',
    'Gardens',
    'Weather',
  ],
  [
    'An evening walk mapped where light along the canal path leaves gaps.',
    'Fieldwork',
    'Public space',
    'Lighting',
  ],
  [
    'Volunteers wrote reusable instructions after fixing a coat pocket at the repair table.',
    'Repair',
    'Community',
    'Tools',
  ],
  [
    'A short checklist for setting up a welcoming and practical repair café.',
    'Repair',
    'Community',
    'Tools',
  ],
  [
    'A printable table records paired temperature and wind readings across three days.',
    'Libraries',
    'Fieldwork',
    'Urban climate',
  ],
  [
    'A seed librarian explains how gardeners store, label and return seeds.',
    'Libraries',
    'Community',
    'Gardens',
  ],
  [
    'Volunteers assign a welcome station, sorting tables and an end-of-day count.',
    'Community',
    'Gardens',
    'Fieldwork',
  ],
] as const;

export function startDemoProvider() {
  const signatures = [
    'stairwell to the roof',
    'glass gauge',
    'last delivery bike',
    'box of thread',
    'portable lamp',
    'North Branch Library',
    'paper envelopes',
    'seed swap sign',
  ];
  return startMockProvider({
    answer(messages) {
      const system = String(messages.find((message) => message.role === 'system')?.content);
      const prompt = String(messages.at(-1)?.content);
      if (system.includes('library companion')) {
        const { savedPassages } = JSON.parse(prompt) as {
          savedPassages: { number: number; text: string }[];
        };
        const evidence = savedPassages.find(({ text }) => text.includes(citationQuote));
        assert.ok(evidence, 'The demo answer requires the gravel-sensor passage.');
        return `The sensor above the **unshaded gravel** gave the clearest early warning that heat was building on the library roof. [${evidence.number}]`;
      }
      // The overview step is plain text: reuse the item's own chunk summary.
      if (prompt.startsWith('Combine these summaries')) return prompt.split('\n\n')[1];
      if (system.includes('Organize only')) {
        const index = signatures.findIndex((phrase) => prompt.includes(phrase));
        const [summary, ...tags] = summaries[index] ?? summaries[0];
        return JSON.stringify({ summary, tags, entities: [], relationships: [] });
      }
    },
  });
}

async function startDemoSources() {
  const covers = articles.map((_, index) => demoCover(index));
  const server = createServer((request, response) => {
    const url = request.url;
    const cover = articles.findIndex(({ slug }) => url === `/${slug}.png`);
    if (cover >= 0) {
      response.writeHead(200, { 'content-type': 'image/png' }).end(covers[cover]);
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
      <meta property="og:image" content="/${slug}.png">
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
            id: 'seed-library-demo',
            title: transcriptTitle,
            author: 'Seed Library Radio',
            audioUrl: `${sources.origin}/seed-library.wav`,
            transcriptUrl: `${sources.origin}/seed-library.vtt`,
            duration: 29,
          },
        },
        db,
      );

      const articleIds: string[] = [];
      for (const article of [...articles].reverse()) {
        const { item } = await capture(
          user,
          { kind: 'article', url: `${sources.origin}/${article.slug}` },
          'web',
          db,
        );
        articleIds.unshift(item.id);
      }
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
      const ids = [...articleIds, savedNote.id, pdfId, transcriptId, callId];
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
