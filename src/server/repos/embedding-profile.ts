import type { Database, Queryable } from '@/server/db';

type Profile = {
  embedding_model: string | null;
  embedding_dimensions: number | null;
  embedding_invalid: boolean;
};

export async function embeddingProfile(db: Queryable, lock = false) {
  return (
    await db.query<Profile>(
      'SELECT embedding_model,embedding_dimensions,embedding_invalid FROM instance_setting WHERE singleton' +
        (lock ? ' FOR UPDATE' : ''),
    )
  ).rows[0];
}

function validateDimensions(dimensions: number) {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 2000) {
    throw new Error('HNSW supports embeddings of 1 to 2000 dimensions.');
  }
}

async function saveProfile(tx: Queryable, model: string, dimensions: number) {
  await tx.query(
    'UPDATE instance_setting SET embedding_model=$1,embedding_dimensions=$2,embedding_invalid=false WHERE singleton',
    [model, dimensions],
  );
}

export async function ensureEmbeddingProfile(db: Database, model: string, dimensions: number) {
  validateDimensions(dimensions);
  return db.transaction(async (tx) => {
    const current = await embeddingProfile(tx, true);
    if (current.embedding_model) {
      if (current.embedding_model === model && current.embedding_dimensions !== dimensions) {
        await tx.query('UPDATE instance_setting SET embedding_invalid=true WHERE singleton');
        return false;
      }
      return !current.embedding_invalid && current.embedding_model === model;
    }

    await tx.query(
      `ALTER TABLE knowledge_chunk ALTER COLUMN embedding TYPE vector(${dimensions}) USING embedding::vector`,
    );
    await tx.query(
      'CREATE INDEX knowledge_chunk_embedding_hnsw ON knowledge_chunk USING hnsw (embedding vector_cosine_ops)',
    );
    await saveProfile(tx, model, dimensions);
    return true;
  });
}

export async function rebuildEmbeddings(db: Database, model: string, dimensions: number) {
  validateDimensions(dimensions);
  await db.transaction(async (tx) => {
    await embeddingProfile(tx, true);
    await tx.query(`UPDATE knowledge_job
      SET revision=revision+1, state='queued', stage=CASE WHEN stage='chunks' THEN stage ELSE 'enrich' END,
          lease=NULL, locked_at=NULL, attempts=0, error=NULL, available_at=now()
      WHERE EXISTS (SELECT 1 FROM knowledge_chunk c WHERE c.item_id=knowledge_job.item_id)
    `);
    await tx.query('DROP INDEX IF EXISTS knowledge_chunk_embedding_hnsw');
    await tx.query('ALTER TABLE knowledge_chunk DROP COLUMN embedding');
    await tx.query(`ALTER TABLE knowledge_chunk ADD COLUMN embedding vector(${dimensions})`);
    await tx.query('UPDATE knowledge_chunk SET embedding_model=NULL');
    await tx.query(
      'CREATE INDEX knowledge_chunk_embedding_hnsw ON knowledge_chunk USING hnsw (embedding vector_cosine_ops)',
    );
    await saveProfile(tx, model, dimensions);
  });
}
