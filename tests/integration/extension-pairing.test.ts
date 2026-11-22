import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from '../../src/server/db';
import { tokenHash } from '../../src/server/security/token-hash';
import {
  approvePair,
  exchangePair,
  issueReceipt,
  receiptStatus,
} from '../../src/server/auth/extension';
import { capture } from '../../src/server/services/library';
import { processNext } from '../../src/server/jobs/worker';

test('pairing, retries, expiry, receipt ownership, duplicate saves, extraction and revocation work together', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3),($4,$5,$6)', [
      'a',
      'Alice',
      'a@ext.invalid',
      'b',
      'Bob',
      'b@ext.invalid',
    ]);
    const secret = randomBytes(32).toString('base64url'),
      challenge = tokenHash(secret);
    assert.deepEqual(await exchangePair(secret, db), { connected: false });
    await approvePair('a', challenge, db);
    await assert.rejects(approvePair('b', challenge, db), /already approved/);
    assert.deepEqual(await exchangePair(randomBytes(32).toString('base64url'), db), {
      connected: false,
    });
    const result = await exchangePair(secret, db);
    assert.equal(result.token, 'am_ext_' + secret);
    assert.deepEqual(await exchangePair(secret, db), result);
    const tokens = await db.query<{ id: string; token_hash: string; user_id: string }>(
      'SELECT * FROM capture_token',
    );
    assert.equal(tokens.rows.length, 1);
    assert.equal(tokens.rows[0].user_id, 'a');
    assert.equal(tokens.rows[0].token_hash, tokenHash(result.token!));
    const first = await capture(
      'a',
      { kind: 'article', url: 'https://example.org/article?utm_source=chrome' },
      'extension',
      db,
    );
    const duplicate = await capture(
      'a',
      { kind: 'article', url: 'https://example.org/article#same' },
      'extension',
      db,
    );
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.item.id, first.item.id);
    const receipt = await issueReceipt(tokens.rows[0].id, first.item.id, db);
    assert.equal((await receiptStatus(tokens.rows[0].id, 'a', receipt, db)).status, 'pending');
    await assert.rejects(receiptStatus(tokens.rows[0].id, 'b', receipt, db), /unavailable/);
    await assert.rejects(receiptStatus(randomUUID(), 'a', receipt, db), /unavailable/);
    await processNext(
      db,
      async () => ({
        title: 'An extracted article',
        author: null,
        excerpt: 'Test',
        passages: [{ index: 0, text: 'This is the extracted article.' }],
        readingHtml: '<p id="p-0" data-passage="0">This is the extracted article.</p>',
        words: 5,
        domain: 'example.org',
      }),
      'a',
    );
    const ready = await receiptStatus(tokens.rows[0].id, 'a', receipt, db);
    assert.deepEqual(ready, { id: first.item.id, status: 'ready', error: null });
    assert.equal('passages' in ready, false);
    await db.query("UPDATE capture_receipt SET expires_at=now()-interval '1 second'");
    await assert.rejects(receiptStatus(tokens.rows[0].id, 'a', receipt, db), /expired/);
    await db.query('DELETE FROM capture_token WHERE id=$1', [tokens.rows[0].id]);
    await assert.rejects(exchangePair(secret, db), /revoked/);
    assert.equal((await db.query('SELECT * FROM capture_receipt')).rows.length, 0);
    const expired = randomBytes(32).toString('base64url');
    await approvePair('a', tokenHash(expired), db);
    await db.query("UPDATE extension_pair SET expires_at=now()-interval '1 second'");
    assert.deepEqual(await exchangePair(expired, db), { connected: false });
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
