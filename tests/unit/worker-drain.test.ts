import test from 'node:test';
import assert from 'node:assert/strict';
import { drainAvailableWork } from '../../scripts/worker-drain';

test('worker imports before organization and finishes a document beyond one old batch', async () => {
  let imported = false,
    pending = 0;
  const result = await drainAvailableWork({
    importNext: async () => {
      if (imported) return false;
      imported = true;
      pending = 30;
      return true;
    },
    organizeNext: async () => {
      if (!pending) return false;
      pending--;
      return true;
    },
  });
  assert.deepEqual(result, { imports: 1, organizationSteps: 30, stopped: 'idle' });
  assert.equal(pending, 0);
});

test('worker yields at its step limit and a later invocation resumes persisted work', async () => {
  let pending = 7;
  const options = {
    importNext: async () => false,
    organizeNext: async () => (pending > 0 ? (pending--, true) : false),
    maxSteps: 3,
  };
  assert.deepEqual(await drainAvailableWork(options), {
    imports: 0,
    organizationSteps: 3,
    stopped: 'budget',
  });
  assert.equal(pending, 4);
  await drainAvailableWork({ ...options, maxSteps: 10 });
  assert.equal(pending, 0);
});

test('worker stops after its deadline without starting another provider call or polling idle work', async () => {
  let time = 0,
    calls = 0;
  const result = await drainAvailableWork({
    now: () => time,
    maxMilliseconds: 10,
    importNext: async () => {
      time = 11;
      return true;
    },
    organizeNext: async () => {
      calls++;
      return true;
    },
  });
  assert.deepEqual(result, { imports: 1, organizationSteps: 0, stopped: 'budget' });
  assert.equal(calls, 0);
  let polls = 0;
  await drainAvailableWork({
    importNext: async () => {
      polls++;
      return false;
    },
    organizeNext: async () => false,
  });
  assert.equal(polls, 1);
});
