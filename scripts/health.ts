import { getConfig } from '../src/server/config';
import { createDatabase } from '../src/server/db';
import { workerHealthy } from '../src/server/jobs/runtime';
import { localHealthURL } from '../src/server/services/health';

async function main() {
  const config = getConfig();
  if (config.ROLE !== 'worker') {
    const response = await fetch(localHealthURL(), {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  }
  const db = await createDatabase(config.DATABASE_URL, false);
  try {
    return await workerHealthy(db);
  } finally {
    await db.close();
  }
}
main().then(
  (healthy) => {
    process.exitCode = healthy ? 0 : 1;
  },
  () => {
    process.exitCode = 1;
  },
);
