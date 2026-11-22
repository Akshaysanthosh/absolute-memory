import { integrationIdentity } from '../../src/server/auth/integration-identity';
import {
  createIntegrationKey,
  listIntegrationKeys,
  revokeIntegrationKey,
} from '../../src/server/services/integration-keys';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';
import {
  integrationSaveStatus,
  readIntegrationItem,
  saveIntegrationItem,
  searchIntegrationItems,
} from '../../src/server/services/integration-api';

test('personal API keys isolate owners, scopes, write receipts, retries, expiry and revocation', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  const request = (token: string) =>
    new Request('https://am.test/api/v1/items', { headers: { Authorization: 'Bearer ' + token } });
  try {
    await db.query(`INSERT INTO "user"(id,name,email) VALUES
      ('alice','Alice','a@example.invalid'),('bob','Bob','b@example.invalid')`);
    const read = await createIntegrationKey(
      'alice',
      { label: 'Read only', scopes: ['library:read'] },
      db,
    );
    const write = await createIntegrationKey(
      'alice',
      { label: 'Write only', scopes: ['library:write'] },
      db,
    );
    const second = await createIntegrationKey(
      'alice',
      { label: 'Second writer', scopes: ['library:write'] },
      db,
    );
    await assert.rejects(integrationIdentity(request(read.token), 'library:write', db), {
      status: 403,
    });
    await assert.rejects(integrationIdentity(request(write.token), 'library:read', db), {
      status: 403,
    });
    await assert.rejects(
      integrationIdentity(request('am_ext_' + write.token.slice(4)), 'library:read', db),
      { status: 401 },
    );
    const reader = await integrationIdentity(request(read.token), 'library:read', db);
    const writer = await integrationIdentity(request(write.token), 'library:write', db);
    const otherWriter = await integrationIdentity(request(second.token), 'library:write', db);
    const foreign = (
      await capture(
        'bob',
        { kind: 'note', title: 'Shared Term', text: 'Private foreign content' },
        'web',
        db,
      )
    ).item;
    const input = { kind: 'note', title: 'Shared Term', text: 'Private owned content' } as const;
    await assert.rejects(saveIntegrationItem(writer, input, null, db), { status: 400 });
    const saves = await Promise.all(
      Array.from({ length: 3 }, () => saveIntegrationItem(writer, input, 'stable-request', db)),
    );
    const item = saves[0].item;
    assert.equal(saves.filter((result) => !result.duplicate).length, 1);
    assert.ok(saves.every((result) => result.item.id === item.id));
    assert.equal(item.channel, 'api');
    await assert.rejects(
      saveIntegrationItem(writer, { ...input, text: 'Changed content' }, 'stable-request', db),
      { status: 409 },
    );
    assert.deepEqual(await integrationSaveStatus(writer, item.id, db), {
      id: item.id,
      status: 'ready',
    });
    await assert.rejects(integrationSaveStatus(otherWriter, item.id, db), { status: 404 });
    await assert.rejects(integrationSaveStatus(writer, foreign.id, db), { status: 404 });
    const url = await saveIntegrationItem(
      writer,
      { kind: 'article', url: 'https://example.org/page?utm_source=api' },
      null,
      db,
    );
    const replay = await saveIntegrationItem(
      writer,
      { kind: 'article', url: 'https://example.org/page#part' },
      null,
      db,
    );
    assert.equal(url.item.id, replay.item.id);
    assert.equal(replay.duplicate, true);
    assert.deepEqual(
      (await searchIntegrationItems(reader.user_id, 'Shared Term', db)).map((result) => result.id),
      [item.id],
    );
    assert.equal(
      (await readIntegrationItem(reader.user_id, item.id, 0, db)).passages[0].text,
      input.text,
    );
    await assert.rejects(readIntegrationItem(reader.user_id, foreign.id, 0, db), { status: 404 });
    const listing = JSON.stringify(await listIntegrationKeys('alice', db));
    assert.match(listing, /Write only/);
    assert.doesNotMatch(listing, /token_hash|am_/);
    await assert.rejects(revokeIntegrationKey('bob', writer.id, db), { status: 404 });
    await assert.rejects(
      db.query('INSERT INTO integration_save(token_id,user_id,item_id) VALUES($1,$2,$3)', [
        writer.id,
        'alice',
        foreign.id,
      ]),
      { code: '23503' },
    );
    await revokeIntegrationKey('alice', writer.id, db);
    await assert.rejects(integrationIdentity(request(write.token), 'library:write', db), {
      status: 401,
    });
    assert.equal(
      (await db.query('SELECT * FROM integration_save WHERE token_id=$1', [writer.id])).rows.length,
      0,
    );
    await db.query(
      "UPDATE integration_token SET expires_at=now()-interval '1 second' WHERE id=$1",
      [reader.id],
    );
    await assert.rejects(integrationIdentity(request(read.token), 'library:read', db), {
      status: 401,
    });
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
