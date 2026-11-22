import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import {
  getChatModel,
  getEmbeddingModel,
  getTranscriber,
  liveKnowledgeProvider,
  StructuredOutputError,
} from '../../src/server/providers';
import { startMockProvider } from '../fixtures/mock-provider/server';
import { z } from 'zod';

test('configured providers fall back to prompt JSON, cap generated counts and support streaming', async (t) => {
  const fixture = await startMockProvider({ rejectStructured: true });
  t.after(fixture.close);
  t.mock.method(process, 'emitWarning', () => {});
  const env = {
    AI_BASE_URL: fixture.baseURL,
    AI_MODEL: 'fixture-chat',
    AI_STRUCTURED_OUTPUT: 'auto',
    EMBEDDINGS_MODEL: 'fixture-embedding',
    EMBEDDINGS_DIMENSIONS: '8',
    TRANSCRIPTION_BASE_URL: fixture.baseURL,
    TRANSCRIPTION_MODEL: 'fixture-transcription',
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const result = await liveKnowledgeProvider.analyze('Exact source quote.');
  assert.equal(result.value.summary, 'A fixture summary.');
  assert.equal(result.value.entities.length, 12);
  assert.equal(result.value.entities[0]?.evidence, 'Exact source quote.');
  assert.equal(result.value.tags.length, 5);
  assert.deepEqual(fixture.calls, ['json_schema', 'json_object', 'plain']);
  const chat = getChatModel()!;
  await assert.rejects(
    chat.generateObject(z.object({ count: z.number() }), {
      instructions: 'A fixture response',
      prompt: 'Respond with OK',
      maxOutputTokens: 20,
    }),
    StructuredOutputError,
  );
  const reply = chat.streamText({
    instructions: 'A fixture response',
    prompt: 'Respond with OK',
    maxOutputTokens: 20,
  });
  assert.equal(await reply.text, 'OK');
  const embedding = await getEmbeddingModel()!.embed(['one', 'two']);
  assert.equal(embedding.dimensions, 8);
  assert.equal(embedding.vectors.length, 2);
  assert.notDeepEqual(...(embedding.vectors as [number[], number[]]));
  const transcriber = getTranscriber()!;
  const transcript = await transcriber.transcribe(Readable.from([Buffer.from('audio fixture')]), {
    maxBytes: 100,
  });
  assert.deepEqual(transcript.segments, [
    { text: 'A local fixture transcript', offset: 1000, duration: 1000 },
  ]);
  await assert.rejects(
    transcriber.transcribe(Readable.from([Buffer.alloc(10)]), { maxBytes: 9 }),
    /upload limit/,
  );
});
