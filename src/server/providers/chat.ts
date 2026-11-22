import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  streamText,
  type ModelMessage,
} from 'ai';
import { z } from 'zod';

export type ModelEndpoint = { baseURL: string; apiKey?: string; model: string };
type Format = 'auto' | 'json_schema' | 'json_object' | 'prompt';
type Request = {
  instructions: string;
  maxOutputTokens: number;
  abortSignal?: AbortSignal;
} & ({ prompt: string; messages?: never } | { messages: ModelMessage[]; prompt?: never });

export const endpointFetch: typeof fetch = (input, options) =>
  fetch(input, { ...options, redirect: 'error' });

export class StructuredOutputError extends Error {
  constructor() {
    super('The configured model returned invalid JSON.');
    this.name = 'StructuredOutputError';
  }
}

export function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new StructuredOutputError();

  let depth = 0;
  let quoted = false;
  let escaping = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaping) escaping = false;
      else if (char === '\\') escaping = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, index + 1)) as unknown;
      } catch {
        throw new StructuredOutputError();
      }
    }
  }
  throw new StructuredOutputError();
}

function formatRejected(error: unknown) {
  return APICallError.isInstance(error) && [400, 415, 422, 501].includes(error.statusCode ?? 0);
}

export function createChatModel(endpoint: ModelEndpoint, format: Format) {
  const modelFor = (structured: boolean) =>
    createOpenAICompatible({
      name: 'absolute-memory',
      baseURL: endpoint.baseURL.replace(/\/+$/, ''),
      apiKey: endpoint.apiKey,
      supportsStructuredOutputs: structured,
      fetch: endpointFetch,
    }).chatModel(endpoint.model);
  const plainModel = modelFor(false);

  function options(input: Request) {
    return {
      ...input,
      maxRetries: 2,
      abortSignal: input.abortSignal ?? AbortSignal.timeout(45_000),
    };
  }

  return {
    name: endpoint.model,
    generateText: (input: Request) => generateText({ ...options(input), model: plainModel }),
    streamText: (input: Request) =>
      streamText({ ...options(input), model: plainModel, onError: () => {} }),
    async generateObject<T extends z.ZodType>(schema: T, input: Request) {
      const modes =
        format === 'auto'
          ? (['json_schema', 'json_object', 'prompt'] as const)
          : ([format] as const);
      const requestOptions = options(input);
      for (const mode of modes) {
        try {
          if (mode !== 'prompt') {
            const result = await generateText({
              ...requestOptions,
              model: modelFor(mode === 'json_schema'),
              output: Output.object({ schema }),
            });
            return {
              output: result.output as z.output<T>,
              usage: result.usage,
              finishReason: result.finishReason,
            };
          }

          const instructions =
            input.instructions +
            '\nReturn only a JSON object matching this schema:\n' +
            JSON.stringify(z.toJSONSchema(schema, { io: 'input' }));
          const result = await generateText({ ...requestOptions, instructions, model: plainModel });
          const parsed = schema.safeParse(parseJsonObject(result.text));
          if (!parsed.success) throw new StructuredOutputError();
          return { output: parsed.data, usage: result.usage, finishReason: result.finishReason };
        } catch (error) {
          if (format === 'auto' && mode !== 'prompt' && formatRejected(error)) continue;
          if (NoObjectGeneratedError.isInstance(error)) throw new StructuredOutputError();
          throw error;
        }
      }
      throw new StructuredOutputError();
    },
  };
}

export type ChatModel = ReturnType<typeof createChatModel>;
