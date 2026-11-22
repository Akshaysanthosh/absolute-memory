import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createChatModel } from '../../src/server/providers/chat';

test('automatic structured output tries JSON Schema, JSON object and prompt JSON in order', async (t) => {
  const attempts: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_request: unknown, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    const format = body.response_format?.type ?? 'prompt';
    attempts.push(format);
    if (format !== 'prompt') {
      return Response.json({ error: { message: 'Unsupported response format' } }, { status: 400 });
    }
    assert.match(String(body.messages[0]?.content), /Return only a JSON object/);
    return Response.json({
      id: 'mock',
      object: 'chat.completion',
      created: 1,
      model: 'fixture',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '\x60\x60\x60json\n{"count":2}\n\x60\x60\x60' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    });
  });
  const model = createChatModel({ baseURL: 'http://fixture.invalid/v1', model: 'fixture' }, 'auto');
  const result = await model.generateObject(z.object({ count: z.number().int() }), {
    instructions: 'Count the items.',
    prompt: 'Two items are shown.',
    maxOutputTokens: 100,
  });
  assert.deepEqual(result.output, { count: 2 });
  assert.deepEqual(attempts, ['json_schema', 'json_object', 'prompt']);
});
