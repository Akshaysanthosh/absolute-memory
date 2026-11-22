import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany } from 'ai';
import { endpointFetch, type ModelEndpoint } from './chat';

export function createEmbeddingModel(endpoint: ModelEndpoint, dimensions?: number) {
  const provider = createOpenAICompatible({
    name: 'absolute-memory',
    baseURL: endpoint.baseURL.replace(/\/+$/, ''),
    apiKey: endpoint.apiKey,
    fetch: endpointFetch,
  });
  return {
    name: endpoint.model,
    async embed(texts: string[], signal?: AbortSignal) {
      const timeout = AbortSignal.timeout(45_000);
      const result = await embedMany({
        model: provider.embeddingModel(endpoint.model),
        values: texts,
        dimensions,
        maxRetries: 2,
        abortSignal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
      const count = result.embeddings[0]?.length;
      if (
        !count ||
        count > 2000 ||
        (dimensions && count !== dimensions) ||
        result.embeddings.length !== texts.length ||
        result.embeddings.some(
          (vector) => vector.length !== count || vector.some((value) => !Number.isFinite(value)),
        )
      ) {
        throw new Error('The embedding response has an unsupported dimension.');
      }
      return {
        vectors: result.embeddings,
        dimensions: count,
        inputTokens: result.usage.tokens,
        model: endpoint.model,
      };
    },
  };
}
