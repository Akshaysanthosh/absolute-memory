import { getConfig } from '../src/server/config';
import { getDatabase } from '../src/server/db';
import { startWorkerLoop } from '../src/server/jobs/runtime';

async function main() {
  if (!getConfig().DATABASE_URL) throw new Error('The separate worker requires DATABASE_URL.');
  const db = await getDatabase();
  const stop = startWorkerLoop(async () => db, { keepAlive: true });
  console.log(JSON.stringify({ event: 'worker.started' }));
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await stop();
    await db.close();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'worker.start_failed',
      error: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
});
