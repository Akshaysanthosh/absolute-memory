import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { getConfig } from '../../src/server/config';
import { createDatabase } from '../../src/server/db';
import { getStorage, getTranscriber } from '../../src/server/providers';
import { testProviderConnections } from '../../src/server/services/capabilities';
import { databaseHealth, localHealthURL } from '../../src/server/services/health';
import { executable, runFile } from '../../src/server/services/media/tools';

let failures = 0;
function report(condition: boolean, label: string, detail?: string) {
  console.log(`${condition ? '✓' : '✗'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!condition) failures++;
}

async function check(name: string, run: () => Promise<string>, fix: string) {
  try {
    report(true, name, await run());
  } catch {
    report(false, name, fix);
  }
}

async function inspectDatabase(config: ReturnType<typeof getConfig>) {
  try {
    const ready = await fetch(localHealthURL(), {
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    const data = (await ready.json()) as { checks?: Awaited<ReturnType<typeof databaseHealth>> };
    if (data.checks) return data.checks;
  } catch {
    /* Offline diagnostics can open an unused database. */
  }
  const db = await createDatabase(config.DATABASE_URL, false);
  try {
    return await databaseHealth(db);
  } finally {
    await db.close();
  }
}

function sampleAudio() {
  const sample = Buffer.alloc(44 + 3200);
  sample.write('RIFF', 0);
  sample.writeUInt32LE(sample.length - 8, 4);
  sample.write('WAVEfmt ', 8);
  sample.writeUInt32LE(16, 16);
  sample.writeUInt16LE(1, 20);
  sample.writeUInt16LE(1, 22);
  sample.writeUInt32LE(16000, 24);
  sample.writeUInt32LE(32000, 28);
  sample.writeUInt16LE(2, 32);
  sample.writeUInt16LE(16, 34);
  sample.write('data', 36);
  sample.writeUInt32LE(sample.length - 44, 40);
  return sample;
}

async function main() {
  const config = getConfig();
  report(true, 'Configuration', config.ROLE);
  try {
    const status = await inspectDatabase(config);
    report(status.database, 'Database');
    report(
      status.migrations,
      'Schema migrations',
      status.migrations ? 'Up to date' : 'Run absolute-memory migrate',
    );
    report(status.vector, 'pgvector', status.vector ? undefined : 'Install or enable pgvector');
    report(
      status.worker,
      'Worker heartbeat',
      status.worker ? 'Seen within 90 seconds' : 'Start the worker and check its logs',
    );
    report(
      !status.embeddingMismatch,
      'Embedding dimensions',
      status.embeddingMismatch
        ? 'Run absolute-memory reembed'
        : 'Compatible or awaiting first vector',
    );
  } catch {
    report(
      false,
      'Database and migration checks',
      'Start the instance or check DATABASE_URL and migrate',
    );
  }
  await check(
    'Storage write and read',
    async () => {
      const storage = getStorage();
      const key = `diagnostics/${randomUUID()}`;
      try {
        await storage.put(key, Buffer.from('diagnostic'), 'text/plain');
        if (!(await storage.exists(key))) throw new Error('Missing test file');
        return config.STORAGE_DRIVER;
      } finally {
        await storage.delete(key);
      }
    },
    'Check DATA_DIR permissions or S3 settings',
  );
  await check(
    'App reachable',
    async () => {
      const configured = new URL(config.APP_URL);
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(configured.hostname);
      const response = await fetch(local ? localHealthURL() : new URL('/api/health', configured), {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Unhealthy');
      return config.APP_URL;
    },
    'Check APP_URL, the listening port and reverse proxy',
  );
  const checks = await testProviderConnections(AbortSignal.timeout(45_000));
  for (const provider of ['Chat', 'Embeddings']) {
    const result = checks.find((check) => check.provider === provider);
    report(result?.ok ?? true, `${provider} endpoint`, result?.detail ?? 'Disabled');
  }
  const transcriber = getTranscriber();
  if (transcriber)
    await check(
      'Transcription endpoint',
      async () => {
        const data = sampleAudio();
        await transcriber.transcribe(Readable.from([data]), {
          maxBytes: data.length,
          signal: AbortSignal.timeout(30_000),
        });
        return transcriber.name;
      },
      'Check the transcription endpoint, key, model and audio API',
    );
  else report(true, 'Transcription endpoint', 'Disabled');
  for (const command of ['yt-dlp', 'ffmpeg']) {
    await check(
      command,
      async () => {
        const binary = executable(command);
        if (!binary) throw new Error('Missing executable');
        const { stdout } = await runFile(
          binary,
          [command === 'ffmpeg' ? '-version' : '--version'],
          { timeout: 5000 },
        );
        const version = stdout.trim().split('\n')[0];
        if (command === 'yt-dlp' && /^\d{4}\.\d{2}\.\d{2}/.test(version)) {
          const release = Date.parse(version.slice(0, 10).replaceAll('.', '-') + 'T00:00:00Z');
          if (Date.now() - release > 60 * 86_400_000)
            console.warn('yt-dlp is more than 60 days old. Update the app image or local binary.');
        }
        return version;
      },
      `Install ${command} or use the container image`,
    );
  }
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : 'Doctor failed'}`);
  process.exitCode = 1;
});
