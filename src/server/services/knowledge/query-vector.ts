import type { Queryable } from '@/server/db';
import { getEmbeddingModel } from '@/server/providers';
import { embeddingAvailability } from '@/server/services/embeddings';

export async function itemSearchVector(query: string, db: Queryable) {
  if (!query) return null;
  const model = getEmbeddingModel();
  if (!model) return null;
  const profile = await embeddingAvailability(db);
  if (!profile.enabled || !profile.initialized) return null;
  try {
    const { vectors, dimensions } = await model.embed([query], AbortSignal.timeout(5_000));
    return dimensions === profile.dimensions
      ? { vector: JSON.stringify(vectors[0]), model: model.name }
      : null;
  } catch {
    return null;
  }
}
