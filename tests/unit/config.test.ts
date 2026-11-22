import assert from 'node:assert/strict';
import test from 'node:test';
import { parseConfig } from '../../src/server/config';

test('configuration supplies self-hosting defaults', () => {
  const config = parseConfig({});
  assert.equal(config.APP_URL, 'http://localhost:3000');
  assert.equal(config.ROLE, 'all');
  assert.equal(config.STORAGE_DRIVER, 'local');
  assert.equal(config.ALLOW_SIGNUP, false);
  assert.equal(config.ALLOW_PRIVATE_NETWORK_FETCH, false);
  assert.equal(config.MEDIA_MAX_DURATION_MINUTES, 180);
});

test('configuration reports every invalid field without including secrets', () => {
  assert.throws(
    () =>
      parseConfig({
        NODE_ENV: 'production',
        APP_URL: 'https://secret@example.test/path',
        AUTH_SECRET: 'short-secret',
        STORAGE_DRIVER: 's3',
        ROLE: 'worker',
        GOOGLE_CLIENT_ID: 'client',
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      for (const field of [
        'APP_URL',
        'AUTH_SECRET',
        'DATABASE_URL',
        'S3_BUCKET',
        'S3_REGION',
        'GOOGLE_CLIENT_SECRET',
      ]) {
        assert.match(error.message, new RegExp(field));
      }
      assert.doesNotMatch(error.message, /short-secret|secret@example/);
      return true;
    },
  );
});
