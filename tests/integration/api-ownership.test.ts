import { createInstanceAccount, createInstanceInvite } from '../../src/server/services/instance';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '../../src/server/db';
import { getAuth } from '../../src/server/auth/auth';
import { capture } from '../../src/server/services/library';
import * as item from '../../src/app/api/items/[id]/route';
import * as knowledge from '../../src/app/api/items/[id]/knowledge/route';
import * as position from '../../src/app/api/items/[id]/position/route';
import * as highlights from '../../src/app/api/items/[id]/highlights/route';
import * as source from '../../src/app/api/items/[id]/source/route';
import * as thumbnail from '../../src/app/api/items/[id]/thumbnail/route';
import * as libraryThread from '../../src/app/api/library-chat/[id]/route';

import { configureTemporaryStorage, attachTestDocument } from '../fixtures/storage';
configureTemporaryStorage();

test('authenticated route handlers reject foreign item and conversation IDs without mutations', async () => {
  process.env.AM_TEST_DB = 'memory';
  delete process.env.DATABASE_URL;
  process.env.APP_URL = 'http://127.0.0.1:3000';
  process.env.AUTH_SECRET = randomBytes(48).toString('hex');
  const db = await getDatabase();
  try {
    const auth = await getAuth();
    const signup = async (name: string, invite?: string) => {
      const email = name + '@test.invalid';
      const password = randomBytes(20).toString('hex');
      const { id } = await createInstanceAccount({ name, email, password, invite }, db);
      const response = await auth.handler(
        new Request('http://127.0.0.1:3000/api/auth/sign-in/email', {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }),
      );
      assert.equal(response.status, 200);
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      assert.ok(cookie);
      return { id, cookie };
    };
    const a = await signup('route-owner');
    const { url } = await createInstanceInvite(a.id);
    const invite = new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
    const b = await signup('route-intruder', invite);
    const saved = (
      await capture(
        a.id,
        {
          kind: 'note',
          title: 'Private route evidence',
          text: 'This sentence belongs only to the owner.',
        },
        'web',
        db,
      )
    ).item;
    const request = (method: string, data?: unknown, cookie = b.cookie) =>
      new Request('http://127.0.0.1:3000/api/test', {
        method,
        headers: {
          Origin: 'http://127.0.0.1:3000',
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    await attachTestDocument(
      db,
      a.id,
      saved.id,
      Buffer.alloc(512),
      'Private fixture.png',
      'image/png',
    );
    const ctx = { params: Promise.resolve({ id: saved.id }) };
    assert.equal(
      (await item.GET(request('GET', undefined, a.cookie), ctx)).status,
      200,
      'owner positive control',
    );
    const cases: [string, () => Promise<Response>][] = [
      ['item read', () => item.GET(request('GET'), ctx)],
      [
        'item edit',
        () => item.PATCH(request('PATCH', { favorite: true, archived: true, progress: 1 }), ctx),
      ],
      ['item delete', () => item.DELETE(request('DELETE'), ctx)],
      ['knowledge read', () => knowledge.GET(request('GET'), ctx)],
      ['tag edit', () => knowledge.PATCH(request('PATCH', { tags: ['Injected'] }), ctx)],
      ['knowledge retry', () => knowledge.POST(request('POST', {}), ctx)],
      [
        'reading position',
        () => position.PUT(request('PUT', { passageIndex: 0, progress: 1 }), ctx),
      ],
      [
        'highlight create',
        () =>
          highlights.POST(
            request('POST', {
              segments: [
                {
                  passageIndex: 0,
                  start: 0,
                  end: saved.passages[0].text.length,
                  text: saved.passages[0].text,
                },
              ],
            }),
            ctx,
          ),
      ],
      ['highlight delete', () => highlights.DELETE(request('DELETE', { id: randomUUID() }), ctx)],
      ['original file', () => source.GET(request('GET'), ctx)],
      ['thumbnail', () => thumbnail.GET(request('GET'), ctx)],
    ];
    for (const [name, run] of cases) assert.equal((await run()).status, 404, name);
    const threadId = randomUUID();
    await db.query('INSERT INTO library_thread(id,user_id,title) VALUES($1,$2,$3)', [
      threadId,
      a.id,
      'Private conversation',
    ]);
    const threadCtx = { params: Promise.resolve({ id: threadId }) };
    assert.equal((await libraryThread.GET(request('GET'), threadCtx)).status, 404);
    // Delete is intentionally idempotent; a foreign identifier must leave the owner's row intact.
    assert.equal((await libraryThread.DELETE(request('DELETE'), threadCtx)).status, 200);
    assert.equal(
      (await db.query('SELECT id FROM library_thread WHERE id=$1 AND user_id=$2', [threadId, a.id]))
        .rows.length,
      1,
    );
    const row = (
      await db.query('SELECT favorite,archived,progress FROM item WHERE id=$1', [saved.id])
    ).rows[0];
    assert.deepEqual(row, { favorite: false, archived: false, progress: 0 });
    assert.equal(
      (await db.query('SELECT id FROM highlight WHERE item_id=$1', [saved.id])).rows.length,
      0,
    );
    assert.equal(
      (await db.query('SELECT * FROM knowledge_tag WHERE item_id=$1', [saved.id])).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
