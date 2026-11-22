import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRefresh } from '../../src/shared/session-refresh';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test('concurrent reads deduplicate; a save during loading discards stale response and waits for fresh data', async () => {
  const first = deferred<string>(),
    second = deferred<string>();
  let reads = 0;
  const committed: string[] = [],
    errors: unknown[] = [];
  const queue = createSessionRefresh({
    load: () => (++reads === 1 ? first.promise : second.promise),
    commit: (value) => committed.push(value),
    error: (error) => errors.push(error),
    settled: () => {},
  });
  const pending = queue.refresh();
  assert.equal(queue.refresh(), pending);
  assert.equal(reads, 1);
  queue.invalidate();
  first.resolve('before save');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reads, 2);
  assert.deepEqual(committed, []);
  second.resolve('after save');
  await pending;
  assert.deepEqual(committed, ['after save']);
  assert.deepEqual(errors, []);
});
test('disposed account never commits late content; next account has an independent request', async () => {
  const oldRequest = deferred<string>();
  const oldValues: string[] = [],
    newValues: string[] = [];
  let oldSettled = 0;
  const old = createSessionRefresh({
    load: () => oldRequest.promise,
    commit: (value) => oldValues.push(value),
    error: () => assert.fail('disposed error'),
    settled: () => oldSettled++,
  });
  const pending = old.refresh();
  old.dispose();
  const next = createSessionRefresh({
    load: async () => 'new account library',
    commit: (value) => newValues.push(value),
    error: () => assert.fail(),
    settled: () => {},
  });
  await next.refresh();
  oldRequest.resolve('old private library');
  await pending;
  await old.refresh();
  assert.deepEqual(oldValues, []);
  assert.equal(oldSettled, 0);
  assert.deepEqual(newValues, ['new account library']);
});
test('failed reads can be retried without a stuck pending request', async () => {
  let reads = 0;
  const values: number[] = [],
    errors: unknown[] = [];
  const queue = createSessionRefresh({
    load: async () => {
      if (++reads === 1) throw Error('offline');
      return 2;
    },
    commit: (v) => values.push(v),
    error: (e) => errors.push(e),
    settled: () => {},
  });
  await queue.refresh();
  await queue.refresh();
  assert.equal(errors.length, 1);
  assert.deepEqual(values, [2]);
});
