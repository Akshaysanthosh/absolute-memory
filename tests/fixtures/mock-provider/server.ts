import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';

async function requestBody(request: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function vector(text: string, dimensions: number) {
  const bytes = createHash('sha256').update(text.toLowerCase().trim()).digest();
  return Array.from({ length: dimensions }, (_, index) => 0.4 + bytes[index % bytes.length] / 255);
}

type Message = { role: string; content: unknown };

function answer(messages: Message[]) {
  const system = messages.find((message) => message.role === 'system')?.content;
  const prompt = messages.at(-1)?.content;
  if (String(prompt).startsWith('Combine these summaries'))
    return 'The saved document explains the fixture topic.';
  if (String(system).includes('Organize only')) {
    const quote = String(prompt).split('\n\n').at(-1)?.trim().slice(0, 80) ?? 'Fixture';
    return JSON.stringify({
      summary: 'A fixture summary.',
      tags: ['fixture', 'reading', 'research', 'reference', 'evidence', 'extra'],
      entities: Array.from({ length: 13 }, (_, i) => ({
        name: `Fixture ${i}`,
        type: 'concept',
        evidence: quote,
      })),
      relationships: [],
    });
  }
  if (String(system).includes('library companion'))
    return 'The saved passage supports this answer [1].';
  return 'OK';
}

export async function startMockProvider(
  options: {
    rejectStructured?: boolean;
    dimensions?: number;
    port?: number;
    host?: string;
    answer?: (messages: Message[]) => string | undefined;
  } = {},
) {
  const calls: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const body = await requestBody(request);
      if (url.pathname.endsWith('/audio/transcriptions')) {
        calls.push('transcription');
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            text: 'A local fixture transcript',
            language: 'en',
            segments: [{ text: 'A local fixture transcript', start: 1, end: 2 }],
          }),
        );
        return;
      }
      const input = JSON.parse(body || '{}');
      response.setHeader('Content-Type', 'application/json');
      if (url.pathname.endsWith('/embeddings')) {
        calls.push('embeddings');
        const texts = Array.isArray(input.input) ? input.input : [input.input];
        response.end(
          JSON.stringify({
            object: 'list',
            model: input.model,
            usage: { prompt_tokens: texts.length, total_tokens: texts.length },
            data: texts.map((text: string, index: number) => ({
              index,
              object: 'embedding',
              embedding: vector(text, input.dimensions ?? options.dimensions ?? 8),
            })),
          }),
        );
        return;
      }
      if (url.pathname.endsWith('/chat/completions')) {
        const format = input.response_format?.type ?? 'plain';
        calls.push(format);
        if (options.rejectStructured && format !== 'plain') {
          response.statusCode = 400;
          response.end(
            JSON.stringify({
              error: { message: 'Unsupported response format', type: 'invalid_request_error' },
            }),
          );
          return;
        }
        const messages = input.messages ?? [];
        let content = options.answer?.(messages) ?? answer(messages);
        if (format === 'plain' && content.startsWith('{'))
          content = '```json\n' + content + '\n```';
        const usage = { prompt_tokens: 7, completion_tokens: 12, total_tokens: 19 };
        const timestamp = Math.floor(Date.now() / 1000);
        if (input.stream) {
          response.setHeader('Content-Type', 'text/event-stream');
          const chunk = (delta: object, finish_reason: string | null = null) => ({
            id: 'mock',
            object: 'chat.completion.chunk',
            created: timestamp,
            model: input.model,
            choices: [{ index: 0, delta, finish_reason }],
            usage,
          });
          for (const part of [chunk({ role: 'assistant', content }), chunk({}, 'stop')]) {
            response.write('data: ' + JSON.stringify(part) + '\n\n');
          }
          response.end('data: [DONE]\n\n');
          return;
        }
        response.end(
          JSON.stringify({
            id: 'mock',
            object: 'chat.completion',
            created: timestamp,
            model: input.model,
            usage,
            choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          }),
        );
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: 'Unknown fixture endpoint' } }));
    } catch {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: { message: 'Invalid fixture request' } }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    calls,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
