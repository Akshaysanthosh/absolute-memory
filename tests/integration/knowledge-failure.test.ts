import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeFailure } from '../../src/server/services/knowledge/failure';
import { recordCall } from '../../src/server/services/knowledge/usage';
import { createDatabase } from '../../src/server/db';

test('organization diagnostics classify failures without copying sensitive provider payloads', () => {
  const privateData = {
    message: 'secret source passage',
    responseBody: 'sk-do-not-log',
    requestBodyValues: { prompt: 'private note' },
  };
  assert.deepEqual(
    knowledgeFailure({
      ...privateData,
      name: 'AI_NoObjectGeneratedError',
      finishReason: 'length',
      usage: { inputTokens: 40, outputTokens: 3000 },
    }),
    { code: 'invalid-output:length', inputTokens: 40, outputTokens: 3000 },
  );
  assert.equal(knowledgeFailure({ ...privateData, cause: { statusCode: 429 } }).code, 'http-429');
  assert.equal(
    knowledgeFailure({ ...privateData, cause: { name: 'TimeoutError' } }).code,
    'timeout',
  );
  assert.equal(knowledgeFailure({ ...privateData, code: '23503' }).code, 'storage-23503');
  assert.equal(knowledgeFailure({ ...privateData, name: 'PlatformLimitError' }).code, 'capacity');
  const invalid = knowledgeFailure({
    ...privateData,
    name: 'private unknown name',
    usage: { inputTokens: -1, outputTokens: Infinity },
  });
  assert.deepEqual(invalid, { code: 'unknown', inputTokens: 0, outputTokens: 0 });
  assert.ok(!JSON.stringify(invalid).includes('secret'));
});

test('failed organization usage retains requested model and reported tokens but no generated text', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('diagnostics','A','diagnostics@test.invalid')`,
    );
    const error = {
      name: 'AI_NoObjectGeneratedError',
      finishReason: 'length',
      message: 'PRIVATE SOURCE',
      text: 'PRIVATE GENERATED TEXT',
      response: { headers: { Authorization: 'SECRET KEY' } },
      usage: { inputTokens: 123, outputTokens: 3000 },
    };
    await recordCall(
      db,
      'diagnostics',
      'organization',
      Date.now() - 10,
      null,
      error,
      'configured-generation-model',
    );
    const row = (
      await db.query(
        'SELECT model,input_tokens,output_tokens,error,duration_ms FROM knowledge_usage WHERE user_id=$1',
        ['diagnostics'],
      )
    ).rows[0];
    assert.equal(row.model, 'configured-generation-model');
    assert.equal(row.input_tokens, 123);
    assert.equal(row.output_tokens, 3000);
    assert.equal(row.error, 'invalid-output:length');
    assert.ok(Number(row.duration_ms) >= 10);
    assert.ok(!JSON.stringify(row).includes('PRIVATE'));
    assert.ok(!JSON.stringify(row).includes('SECRET'));
    await recordCall(
      db,
      'diagnostics',
      'embedding',
      Date.now(),
      { value: [[1]], model: 'configured-embedding-model', inputTokens: 5, outputTokens: 0 },
      { code: '23503', message: 'PRIVATE DB DETAIL' },
    );
    const storage = (
      await db.query('SELECT error,input_tokens FROM knowledge_usage WHERE model=$1', [
        'configured-embedding-model',
      ])
    ).rows[0];
    assert.equal(storage.error, 'storage-23503');
    assert.equal(storage.input_tokens, 5);
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});
