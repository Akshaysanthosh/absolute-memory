import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { failure } from '../../src/server/auth/http';
import { createDatabase, type Database } from '../../src/server/db';
import { redactError } from '../../src/server/logging/events';
import {
  enforceEmailRateLimit,
  enforceRateLimit,
  RateLimitError,
  requestClient,
} from '../../src/server/security/rate-limit';

test('bursts are bounded per subject and policy, with a Retry-After response', async () => {
  const db = { driver: 'pglite' } as Database;
  const subject = randomUUID();
  for (let index = 0; index < 15; index++) await enforceRateLimit('auth', subject, db);
  await assert.rejects(enforceRateLimit('auth', subject, db), (error: RateLimitError) => {
    assert.equal(failure(error).status, 429);
    assert.equal(failure(error).headers.get('Retry-After'), '4');
    return true;
  });
  await enforceRateLimit('auth', randomUUID(), db);
  await enforceRateLimit('capture', subject, db);
});

test(
  'PostgreSQL shares a burst limit across concurrent requests',
  {
    skip: !process.env.AM_TEST_POSTGRES_RATE_URL,
  },
  async () => {
    const db = await createDatabase(process.env.AM_TEST_POSTGRES_RATE_URL, true);
    try {
      const subject = randomUUID();
      const attempts = await Promise.allSettled(
        Array.from({ length: 16 }, () => enforceRateLimit('auth', subject, db)),
      );
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 15);
      assert.equal(
        attempts.filter(
          (result) => result.status === 'rejected' && result.reason instanceof RateLimitError,
        ).length,
        1,
      );
    } finally {
      await db.close();
    }
  },
);

test('logs omit untrusted errors and proxy mode is opt-in', () => {
  assert.equal(redactError(new Error('untrusted site text')), 'Error');
  assert.equal(
    redactError(Object.assign(new Error('ignored'), { name: 'arbitrary provider name' })),
    'Error',
  );
  assert.equal(redactError(new TypeError('untrusted URL')), 'TypeError');
  assert.equal(
    requestClient(new Request('http://example.test', { headers: { 'x-real-ip': '192.0.2.1' } })),
    undefined,
  );
});

test('a resolved personal key is charged to its owner and bypasses the anonymous quota', async () => {
  const { integrationIdentity } = await import('../../src/server/auth/integration-identity');
  const { tokenHash } = await import('../../src/server/security/token-hash');
  const userId = randomUUID();
  const key = { id: randomUUID(), user_id: userId, scopes: ['library:read'] };
  const token = `am_${'t'.repeat(43)}`;
  const expectedBucket = tokenHash(`integration:${userId}`);
  const query = async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM integration_token'))
      return { rows: params[0] === tokenHash(token) ? [key] : [] };
    if (sql.includes('INSERT INTO request_bucket'))
      return { rows: params[0] === expectedBucket ? [{ bucket: expectedBucket }] : [] };
    return { rows: [] };
  };
  const db = { driver: 'postgres', query } as unknown as Database;
  const request = new Request('http://example.test/api/v1/highlights', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.deepEqual(await integrationIdentity(request, 'library:read', db), key);
});

test('account quotas normalize email and keep reset independent from sign-in', async () => {
  const db = { driver: 'pglite' } as Database;
  const address = `${randomUUID()}@example.test`;
  for (let index = 0; index < 10; index++) await enforceEmailRateLimit('auth-sign-in', address, db);
  await assert.rejects(
    enforceEmailRateLimit('auth-sign-in', ` ${address.toUpperCase()} `, db),
    RateLimitError,
  );
  await enforceEmailRateLimit('auth-reset', address, db);
  await enforceEmailRateLimit('auth-sign-in', `other-${address}`, db);
});
