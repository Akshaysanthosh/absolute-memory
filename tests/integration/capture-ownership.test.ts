import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/server/db';
import { capture, ownItem } from '../../src/server/services/library';
import { parseConfig } from '../../src/server/config';
import { loginPathFor, loginReturnPath } from '../../src/shared/return-path';

test('sign-in preserves known workspace and media destinations and discards unsafe redirects', () => {
  const id = '8d733f5a-8931-43f1-9434-17b59a335153';
  for (const next of [
    '/settings?section=sessions',
    '/library?q=podcasts',
    `/read/${id}?cite=2`,
    `/media/${id}?view=transcript`,
  ]) {
    const login = new URL(loginPathFor(next), 'https://app.example.test');
    assert.equal(login.pathname, '/login');
    assert.equal(login.searchParams.get('next'), next);
    assert.equal(loginReturnPath(login.searchParams.get('next')), next);
  }
  for (const next of [
    '//outside.example',
    '/\\outside.example',
    '/%2f%2foutside.example',
    '/settings/../api/export',
    '/api/export',
    '/login?next=/settings',
    '/read/unknown',
    '/settings?section=' + 'x'.repeat(512),
  ]) {
    assert.equal(loginPathFor(next), '/login');
  }
});
test('deduplication and account deletion preserve other libraries', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3),($4,$5,$6)', [
      'limit-a',
      'Alice',
      'limits-a@example.invalid',
      'limit-b',
      'Bob',
      'limits-b@example.invalid',
    ]);
    for (let i = 0; i < 49; i++)
      await db.query(
        "INSERT INTO item(id,user_id,kind,title,url,status,archived) VALUES($1,$2,'article','Saved URL',$3,$4,$5)",
        [
          randomUUID(),
          'limit-a',
          `https://example.org/${i}`,
          i % 2 ? 'failed' : 'ready',
          i % 3 === 0,
        ],
      );
    const results = await Promise.allSettled([
      capture('limit-a', { kind: 'article', url: 'https://example.org/new-web' }, 'web', db),
      capture(
        'limit-a',
        { kind: 'article', url: 'https://example.org/new-extension' },
        'extension',
        db,
      ),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 0);
    assert.equal(
      Number(
        (
          await db.query<{ count: string }>(
            "SELECT count(*) FROM item WHERE user_id='limit-a' AND url IS NOT NULL",
          )
        ).rows[0].count,
      ),
      51,
    );
    assert.equal(
      (await capture('limit-a', { kind: 'article', url: 'https://example.org/52' }, 'web', db))
        .duplicate,
      false,
    );
    const duplicate = await capture(
      'limit-a',
      { kind: 'article', url: 'https://example.org/0?utm_source=chrome#read' },
      'extension',
      db,
    );
    assert.equal(duplicate.duplicate, true);
    const note = await capture(
      'limit-a',
      { kind: 'note', title: 'A free-form note', text: 'Save a note beside the links.' },
      'web',
      db,
    );
    assert.equal(note.item.kind, 'note');
    await assert.rejects(ownItem('limit-b', note.item.id, db), /not found/);
    await db.query('DELETE FROM item WHERE id=$1 AND user_id=$2', [duplicate.item.id, 'limit-a']);
    assert.equal(
      (
        await capture(
          'limit-a',
          { kind: 'article', url: 'https://example.org/replacement' },
          'extension',
          db,
        )
      ).duplicate,
      false,
    );
    assert.equal(
      (
        await capture(
          'limit-b',
          { kind: 'article', url: 'https://example.org/replacement' },
          'web',
          db,
        )
      ).duplicate,
      false,
    );
    // Account removal cascades private data and connections, not other accounts.
    await db.query(
      "INSERT INTO capture_token(id,user_id,name,token_hash) VALUES($1,'limit-a','Browser','testhash')",
      [randomUUID()],
    );
    await db.query('DELETE FROM "user" WHERE id=$1', ['limit-a']);
    for (const table of ['item', 'capture_token'])
      assert.equal(
        (await db.query(`SELECT * FROM ${table} WHERE user_id=$1`, ['limit-a'])).rows.length,
        0,
      );
    assert.equal((await db.query("SELECT * FROM item WHERE user_id='limit-b'")).rows.length, 1);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
test('production accepts a local origin without OAuth and requires a strong secret', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    APP_URL: 'http://localhost:3000',
    AUTH_SECRET: 'x'.repeat(40),
  };
  assert.equal(parseConfig(env).APP_URL, 'http://localhost:3000');
  assert.throws(() => parseConfig({ ...env, APP_URL: 'http://localhost:3000/app' }), /origin/);
  assert.throws(() => parseConfig({ ...env, AUTH_SECRET: 'short' }), /32/);
});
