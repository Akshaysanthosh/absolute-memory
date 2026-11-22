import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../src/app/api/live/route';

test('liveness works without database or provider credentials and disables caching', async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

import { createDatabase } from '../../src/server/db';
import { noteWorkerHeartbeat, workerHealthy } from '../../src/server/jobs/runtime';
import { databaseHealth } from '../../src/server/services/health';

test('health reports applied migrations and considers stale workers offline', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    assert.equal(await workerHealthy(db), false);
    await noteWorkerHeartbeat(db);
    assert.deepEqual(await databaseHealth(db), {
      database: true,
      migrations: true,
      vector: true,
      worker: true,
      embeddingMismatch: false,
    });
    await db.query(
      `UPDATE worker_heartbeat SET last_seen_at=now()-interval '91 seconds' WHERE name='worker'`,
    );
    assert.equal(await workerHealthy(db), false);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
