import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollWhileVisible } from '../../src/shared/visible-poll';

class Visibility extends EventTarget {
  hidden = false;
  change(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('polls serially, pauses hidden tabs, stops at terminal state and cancels on cleanup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const visibility = new Visibility();
  let calls = 0,
    signal: AbortSignal | undefined;
  let finish!: (again: boolean) => void;
  const stop = pollWhileVisible(
    (s) => {
      signal = s;
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    { visibility, onError: () => assert.fail('unexpected error'), intervalMs: 10 },
  );
  assert.equal(calls, 1);
  visibility.change(true);
  visibility.change(false);
  t.mock.timers.tick(100);
  assert.equal(calls, 1, 'visibility changes do not overlap an in-flight request');
  finish(true);
  await settle();
  visibility.change(true);
  t.mock.timers.tick(100);
  assert.equal(calls, 1, 'no hidden-tab requests');
  visibility.change(false);
  assert.equal(calls, 2);
  finish(false);
  await settle();
  t.mock.timers.tick(100);
  visibility.change(true);
  visibility.change(false);
  assert.equal(calls, 2, 'terminal result stays stopped');
  stop();
  assert.equal(signal?.aborted, true);
});

test('transient errors back off and cleanup prevents further work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const visibility = new Visibility();
  let calls = 0,
    errors = 0;
  const stop = pollWhileVisible(
    async () => {
      calls++;
      throw new Error('temporary');
    },
    { visibility, onError: () => errors++, intervalMs: 10, errorIntervalMs: 60 },
  );
  await settle();
  assert.equal(errors, 1);
  t.mock.timers.tick(59);
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls, 2);
  stop();
  t.mock.timers.tick(100);
  visibility.change(false);
  assert.equal(calls, 2);
});
