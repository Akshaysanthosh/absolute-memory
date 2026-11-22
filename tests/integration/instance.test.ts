import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { getAuth, issuePasswordResetLink } from '../../src/server/auth/auth';
import { getDatabase } from '../../src/server/db';
import {
  createInstanceAccount,
  createInstanceInvite,
  instanceOwner,
  listInstanceInvites,
} from '../../src/server/services/instance';
import {
  createIntegrationKey,
  integrationKeySchema,
} from '../../src/server/services/integration-keys';
import { tokenHash } from '../../src/server/security/token-hash';
import { GET as getCapabilityRoute } from '../../src/app/api/capabilities/route';
import { POST as testProviderRoute } from '../../src/app/api/providers/test/route';
import { POST as authPost } from '../../src/app/api/auth/[...all]/route';
import { POST as setup } from '../../src/app/api/setup/route';

test('owner setup is atomic, invites are single use, and password resets revoke sessions and integration credentials', async (t) => {
  process.env.AM_TEST_DB = 'memory';
  process.env.ALLOW_SIGNUP = 'false';
  process.env.AUTH_SECRET = randomBytes(48).toString('base64url');
  const origin = 'http://localhost:3000';
  process.env.APP_URL = origin;
  const db = await getDatabase();
  const auth = await getAuth();
  const originHeaders = { Origin: origin, 'Content-Type': 'application/json' };
  const post = (path: string, body: unknown, cookie?: string) =>
    authPost(
      new Request(origin + '/api/auth/' + path, {
        method: 'POST',
        headers: { ...originHeaders, ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(body),
      }),
    );
  const ownerInput = {
    name: 'Owner',
    email: 'owner@example.test',
    password: 'first-password-2026',
  };
  try {
    assert.equal(await instanceOwner(), null);
    assert.equal(
      (
        await setup(
          new Request(origin + '/api/setup', {
            method: 'POST',
            headers: { ...originHeaders, Origin: 'https://foreign.example' },
            body: JSON.stringify(ownerInput),
          }),
        )
      ).status,
      403,
    );
    const outcomes = await Promise.allSettled([
      createInstanceAccount(ownerInput, db),
      createInstanceAccount({ ...ownerInput, email: 'second@example.test' }, db),
    ]);
    const created = outcomes.find((result) => result.status === 'fulfilled');
    assert.ok(created);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    const owner = created.value.id;
    assert.equal(await instanceOwner(), owner);
    const {
      rows: [account],
    } = await db.query<{ email: string }>('SELECT email FROM "user" WHERE id=$1', [owner]);
    assert.equal(
      (await post('sign-up/email', { ...ownerInput, email: 'blocked@example.test' })).ok,
      false,
    );
    assert.equal(
      (await db.query("SELECT id FROM item WHERE user_id=$1 AND sample_key='welcome'", [owner]))
        .rows.length,
      1,
    );

    const { id: invitation, url } = await createInstanceInvite(owner);
    const token = new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
    assert.equal(JSON.stringify(await listInstanceInvites(owner)).includes(token), false);
    const guest = await createInstanceAccount(
      { ...ownerInput, email: 'guest@example.test', invite: token },
      db,
    );
    await assert.rejects(
      createInstanceAccount({ ...ownerInput, email: 'reuse@example.test', invite: token }, db),
      /already used/,
    );
    await assert.rejects(createInstanceInvite(guest.id), /Only the owner/);
    const [used] = await listInstanceInvites(owner);
    assert.equal(used.id, invitation);
    assert.ok(used.used_at);

    const oldSession = await post('sign-in/email', {
      email: account.email,
      password: ownerInput.password,
    });
    assert.equal(oldSession.status, 200);
    const cookie = oldSession.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(cookie);
    assert.equal(
      (await post('delete-user', { password: ownerInput.password }, cookie)).status,
      403,
    );

    const guestSession = await post('sign-in/email', {
      email: 'guest@example.test',
      password: ownerInput.password,
    });
    const guestCookie = guestSession.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    assert.ok(guestCookie);
    const call = (path: string, method: string, credentials: string) =>
      new Request(origin + path, {
        method,
        headers: { ...originHeaders, Cookie: credentials },
      });
    const expected = process.env.AI_MODEL;
    const previousEndpoint = process.env.AI_BASE_URL;
    process.env.AI_MODEL = 'owner-only-fixture';
    process.env.AI_BASE_URL = 'http://127.0.0.1:11434/v1';
    try {
      await t.test('provider details and diagnostic calls are limited to the owner', async () => {
        const ownerCapabilities = await getCapabilityRoute(
          call('/api/capabilities', 'GET', cookie),
        );
        const guestCapabilities = await getCapabilityRoute(
          call('/api/capabilities', 'GET', guestCookie),
        );
        assert.equal((await ownerCapabilities.json()).model, 'owner-only-fixture');
        assert.equal((await guestCapabilities.json()).model, undefined);
        assert.equal(
          (await testProviderRoute(call('/api/providers/test', 'POST', guestCookie))).status,
          403,
        );
      });
    } finally {
      if (expected === undefined) delete process.env.AI_MODEL;
      else process.env.AI_MODEL = expected;
      if (previousEndpoint === undefined) delete process.env.AI_BASE_URL;
      else process.env.AI_BASE_URL = previousEndpoint;
    }

    const personal = await createIntegrationKey(
      owner,
      { label: 'Personal test key', scopes: ['library:read'] },
      db,
    );
    const captureId = randomUUID();
    await db.query('INSERT INTO capture_token(id,user_id,name,token_hash) VALUES($1,$2,$3,$4)', [
      captureId,
      owner,
      'Fixture extension',
      tokenHash(randomUUID()),
    ]);
    const otherKey = await createIntegrationKey(
      guest.id,
      { label: 'Guest key', scopes: ['library:read'] },
      db,
    );

    const reset = await issuePasswordResetLink(account.email);
    assert.ok(reset);
    assert.equal(
      (await db.query('SELECT id FROM integration_token WHERE id=$1', [personal.key.id])).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query('SELECT id FROM capture_token WHERE id=$1', [captureId])).rows.length,
      1,
    );
    const resetToken = new URL(reset).pathname.split('/').at(-1);
    assert.ok(resetToken);
    const newPassword = 'new-password-2026';
    assert.equal((await post('reset-password', { token: resetToken, newPassword })).status, 200);
    assert.equal((await post('reset-password', { token: resetToken, newPassword })).ok, false);
    assert.equal(await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) }), null);
    assert.equal(
      (await db.query('SELECT id FROM integration_token WHERE id=$1', [personal.key.id])).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query('SELECT id FROM capture_token WHERE id=$1', [captureId])).rows.length,
      0,
    );
    assert.equal(
      (await db.query('SELECT id FROM integration_token WHERE id=$1', [otherKey.key.id])).rows
        .length,
      1,
    );
    assert.equal(
      (await post('sign-in/email', { email: account.email, password: newPassword })).status,
      200,
    );
    const form = await authPost(
      new Request(origin + '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: account.email, password: newPassword }),
      }),
    );
    assert.equal(form.status, 200);
  } finally {
    await db.close();
  }
});

test('permanent integration keys require an explicit no-expiry choice', () => {
  const request = { label: 'Fixture key', scopes: ['library:read'] };
  assert.ok(integrationKeySchema.safeParse(request).success);
  assert.equal(integrationKeySchema.safeParse({ ...request, expiresInDays: null }).success, false);
  assert.ok(integrationKeySchema.safeParse({ ...request, noExpiry: true }).success);
  assert.equal(
    integrationKeySchema.safeParse({ ...request, noExpiry: true, expiresInDays: 30 }).success,
    false,
  );
});
