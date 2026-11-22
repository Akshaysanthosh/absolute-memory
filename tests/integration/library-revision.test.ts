import test from 'node:test';
import assert from 'node:assert/strict';

import { libraryRevision } from '../../src/server/repos/library-revision';
import { createDatabase } from '../../src/server/db';
import { randomUUID } from 'node:crypto';
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('library revision tracks owner metadata and tags without leaking source payloads', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('revision-a','A','revision-a@example.invalid'),('revision-b','B','revision-b@example.invalid')`,
    );
    const a = randomUUID(),
      b = randomUUID();
    await db.query(
      `INSERT INTO item(id,user_id,kind,title) VALUES($1,'revision-a','note','A'),($2,'revision-b','note','B')`,
      [a, b],
    );
    const initial = await libraryRevision('revision-a', db);
    assert.match(initial, /^[a-f0-9]{32}$/);
    await db.query(`UPDATE item SET title='B changed',updated_at=now() WHERE id=$1`, [b]);
    assert.equal(await libraryRevision('revision-a', db), initial);
    await db.query(
      `INSERT INTO knowledge_tag(user_id,item_id,name,origin) VALUES('revision-a',$1,'test','manual')`,
      [a],
    );
    const tagged = await libraryRevision('revision-a', db);
    assert.notEqual(tagged, initial);
    await db.query(`UPDATE knowledge_tag SET origin='dismissed' WHERE item_id=$1`, [a]);
    assert.notEqual(await libraryRevision('revision-a', db), tagged);
    await db.query(`DELETE FROM item WHERE id=$1`, [a]);
    assert.notEqual(await libraryRevision('revision-a', db), initial);
  } finally {
    await db.close();
  }
});
