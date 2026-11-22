import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../src/server/db';
import { capture } from '../../src/server/services/library';

test('repeated answer saves deduplicate per account and topic pages remain scoped', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      "INSERT INTO \"user\"(id,name,email) VALUES('topic-a','A','topic-a@test.invalid'),('topic-b','B','topic-b@test.invalid')",
    );
    const input = {
      kind: 'note' as const,
      title: 'Research answer',
      text: 'A sourced conclusion.',
    };
    const [a, b] = await Promise.all([
      capture('topic-a', input, 'web', db, '00000000-0000-4000-8000-000000000001'),
      capture('topic-a', input, 'web', db, '00000000-0000-4000-8000-000000000001'),
    ]);
    assert.equal(a.item.id, b.item.id);
    const other = await capture(
      'topic-b',
      input,
      'web',
      db,
      '00000000-0000-4000-8000-000000000001',
    );
    assert.notEqual(other.item.id, a.item.id);
    await db.query(
      "INSERT INTO topic_page(user_id,topic,overview) VALUES('topic-a','research','Private overview')",
    );
    assert.equal(
      (await db.query("SELECT * FROM topic_page WHERE user_id='topic-b'")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
