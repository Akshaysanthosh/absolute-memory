import { getConfig } from '@/server/config';
import { getDatabase, type Database, type Queryable } from '@/server/db';
import { getEmbeddingModel } from '@/server/providers';
import { embeddingProfile, rebuildEmbeddings } from '@/server/repos/embedding-profile';

export async function embeddingAvailability(db: Queryable) {
  const config = getConfig();
  if (!config.EMBEDDINGS_MODEL || !(config.EMBEDDINGS_BASE_URL ?? config.AI_BASE_URL)) {
    return { enabled: false, initialized: false, mismatch: false };
  }
  const profile = await embeddingProfile(db);
  const initialized = Boolean(profile.embedding_model);
  const mismatch =
    profile.embedding_invalid ||
    (initialized &&
      (profile.embedding_model !== config.EMBEDDINGS_MODEL ||
        (config.EMBEDDINGS_DIMENSIONS !== undefined &&
          config.EMBEDDINGS_DIMENSIONS !== profile.embedding_dimensions)));
  return { enabled: !mismatch, initialized, mismatch, dimensions: profile.embedding_dimensions };
}

export async function reembed(database?: Database) {
  const model = getEmbeddingModel();
  if (!model) throw new Error('Configure an embedding provider first.');
  const db = database ?? (await getDatabase());
  const probe = await model.embed(['Absolute Memory dimension probe']);
  await rebuildEmbeddings(db, probe.model, probe.dimensions);
  return { model: probe.model, dimensions: probe.dimensions };
}
