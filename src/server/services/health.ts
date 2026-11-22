import { httpPort } from '@/server/config/runtime-environment';
import { listInstalledMigrations, testVectorSupport } from '@/server/repos/health';
import { getConfig } from '@/server/config';
import { getDatabase, type Queryable } from '@/server/db';
import { migrationFiles } from '@/server/db/migrations';
import { workerHealthy } from '@/server/jobs/runtime';
import { embeddingAvailability } from '@/server/services/embeddings';

export async function databaseHealth(database?: Queryable) {
  const db = database ?? (await getDatabase());
  const [migrations, local, vector, worker, embedding] = await Promise.all([
    listInstalledMigrations(db),
    migrationFiles(),
    testVectorSupport(db),
    workerHealthy(db),
    embeddingAvailability(db),
  ]);
  const installed = new Set(migrations.rows.map((row) => row.version));
  return {
    database: true,
    migrations: local.every((path) => installed.has(path.slice(0, 4))),
    vector: vector.rows[0]?.dimensions === 1,
    worker,
    embeddingMismatch: embedding.mismatch,
  };
}

export function localHealthURL() {
  const port = httpPort() || new URL(getConfig().APP_URL).port || '3000';
  return `http://127.0.0.1:${port}/api/health`;
}
