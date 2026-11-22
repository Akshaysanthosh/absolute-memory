import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDelaySeconds } from '../../src/server/jobs/worker';
import { withImportHeartbeat } from '../../src/server/jobs/import-lease';

test('import retries back off: 15 s, 1 min, 4 min, capped at 15 min, with jitter', () => {
  const mid = () => 0.5;
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((a) => retryDelaySeconds(a, mid)),
    [15, 60, 240, 900, 900],
  );
  assert.equal(
    retryDelaySeconds(1, () => 0),
    12,
  );
  assert.equal(
    retryDelaySeconds(1, () => 1),
    18,
  );
});

test('a slow provider call keeps the import claim fresh and stops refreshing afterwards', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const calls: unknown[][] = [];
  const db = {
    query: async (_sql: string, params?: unknown[]) => {
      calls.push(params ?? []);
      return { rows: [] };
    },
  };
  const provider = Promise.withResolvers<string>();
  const result = withImportHeartbeat(db, 'job-1', 'lease-1', () => provider.promise, 15);
  t.mock.timers.tick(15);
  t.mock.timers.tick(15);
  assert.deepEqual(calls, [
    ['job-1', 'lease-1'],
    ['job-1', 'lease-1'],
  ]);
  provider.resolve('done');
  assert.equal(await result, 'done');
  t.mock.timers.tick(60);
  assert.equal(calls.length, 2, 'no refresh after the call finishes');
});
