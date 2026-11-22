import test from 'node:test';
import assert from 'node:assert/strict';
import { pollLibrary } from '../../src/shared/library-poll';

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('library polling skips unchanged loaded pages and stops when signed out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, 'document', { value: visibility, configurable: true });
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'document');
  });
  let marker = 'first',
    refreshes = 0,
    expired = false;
  t.mock.method(globalThis, 'fetch', async (input: unknown) =>
    String(input).includes('/revision')
      ? Response.json(expired ? {} : { revision: marker }, { status: expired ? 401 : 200 })
      : Response.json({ scheduled: true }),
  );
  const stop = pollLibrary({
    importing: true,
    organizing: true,
    refresh: async () => {
      refreshes++;
    },
  });
  await settle();
  assert.equal(refreshes, 1);
  t.mock.timers.tick(15000);
  await settle();
  assert.equal(refreshes, 1);
  marker = 'second';
  t.mock.timers.tick(15000);
  await settle();
  assert.equal(refreshes, 2);
  expired = true;
  t.mock.timers.tick(15000);
  await settle();
  marker = 'third';
  t.mock.timers.tick(60000);
  await settle();
  assert.equal(refreshes, 2);
  stop();
});
