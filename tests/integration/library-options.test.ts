import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { listLibraryOptions } from '../../src/server/repos/library-options';

test('lightweight selectors paginate every owned item without source bodies or other accounts', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES ('picker-a','A','pa@example.invalid'),('picker-b','B','pb@example.invalid')`,
    );
    await db.query(
      `INSERT INTO item(id,user_id,kind,title) SELECT gen_random_uuid(),'picker-a','note','Item '||n FROM generate_series(1,205) n`,
    );
    await db.query(
      `INSERT INTO item(id,user_id,kind,title) VALUES (gen_random_uuid(),'picker-b','note','Private other account')`,
    );
    const all = [];
    let cursor: string | null = null;
    do {
      const page = await listLibraryOptions('picker-a', db, cursor);
      all.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(all.length, 205);
    assert.equal(new Set(all.map((i) => i.id)).size, 205);
    assert.ok(all.every((i) => i.title.startsWith('Item ')));
    assert.deepEqual(Object.keys(all[0]).sort(), [
      'archived',
      'id',
      'media_kind',
      'status',
      'tags',
      'title',
    ]);
    assert.equal((await listLibraryOptions('unknown', db)).items.length, 0);
  } finally {
    await db.close();
  }
});
