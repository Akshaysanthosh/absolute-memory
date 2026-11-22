import { upsertWorkerHeartbeat, findWorkerFreshness } from '@/server/repos/worker-health';
import { deleteStaleRequestBuckets } from '@/server/repos/request-quotas';
import { logEvent } from '@/server/logging/events';
import type { Database, Queryable } from '@/server/db';
import { maintainDocumentAssets } from '@/server/services/document-assets';
import { processTransfer } from '@/server/services/transfers/jobs';
import { runKnowledgeBatch } from './knowledge-worker';
import { processNext } from './worker';
import { drainAvailableWork } from '../../../scripts/worker-drain';

export async function noteWorkerHeartbeat(db: Queryable) {
  await upsertWorkerHeartbeat(db);
}

export async function workerHealthy(db: Queryable) {
  const {
    rows: [row],
  } = await findWorkerFreshness(db);
  return row?.fresh ?? false;
}

export function startWorkerLoop(database: () => Promise<Database>, { keepAlive = false } = {}) {
  let active: Promise<void> | null = null;
  let stopped = false;
  let heartbeat: Promise<void> | null = null;
  const report = (event: string, error: unknown) => logEvent('error', event, error);
  let bucketCleanupAfter = 0;
  function beat() {
    if (stopped || heartbeat) return;
    heartbeat = database()
      .then(noteWorkerHeartbeat)
      .catch((error) => report('worker.heartbeat_failed', error))
      .finally(() => {
        heartbeat = null;
      });
  }
  function run() {
    if (stopped || active) return;
    active = database()
      .then(async (db) => {
        const operations = [
          ['transfers', () => processTransfer(db)],
          [
            'library',
            () =>
              drainAvailableWork({
                importNext: async () => !stopped && (await processNext(db)),
                organizeNext: async () => !stopped && (await runKnowledgeBatch(undefined, db)) > 0,
                maxMilliseconds: 45_000,
                maxSteps: 12,
              }),
          ],
          ['storage_cleanup', () => maintainDocumentAssets(db)],
          [
            'request_bucket_cleanup',
            async () => {
              if (db.driver !== 'postgres' || Date.now() < bucketCleanupAfter) return;
              await deleteStaleRequestBuckets(db);
              bucketCleanupAfter = Date.now() + 15 * 60_000;
            },
          ],
        ] as const;
        for (const [name, task] of operations) {
          if (stopped) break;
          try {
            await task();
          } catch (error) {
            report(`worker.${name}_failed`, error);
          }
        }
      })
      .catch((error) => report('worker.database_failed', error))
      .finally(() => {
        active = null;
      });
  }
  const worker = setInterval(run, 2000);
  const clock = setInterval(beat, 30_000);
  if (!keepAlive) {
    worker.unref();
    clock.unref();
  }
  beat();
  run();
  return async function stop() {
    stopped = true;
    clearInterval(worker);
    clearInterval(clock);
    await Promise.all([active, heartbeat]);
  };
}
