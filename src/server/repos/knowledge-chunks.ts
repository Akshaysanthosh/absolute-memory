import type { Passage } from '@/shared/passages';
import type { Queryable } from '@/server/db';

export function readChunkProgress(db: Queryable, itemId: string, userId: string) {
  return db.query<{ total: string; completed: string }>(
    'SELECT count(*) AS total,count(*) FILTER(WHERE analysis IS NOT NULL AND embedding IS NOT NULL) AS completed FROM knowledge_chunk WHERE item_id=$1 AND user_id=$2',
    [itemId, userId],
  );
}

export function readChunkingSource(db: Queryable, itemId: string, userId: string) {
  return db.query<{ title: string; passages: Passage[] }>(
    'SELECT title,passages FROM item WHERE id=$1 AND user_id=$2',
    [itemId, userId],
  );
}

export function deleteItemChunks(db: Queryable, itemId: string, userId: string) {
  return db.query('DELETE FROM knowledge_chunk WHERE item_id=$1 AND user_id=$2', [itemId, userId]);
}

export function insertKnowledgeChunk(
  db: Queryable,
  chunkId: string,
  userId: string,
  itemId: string,
  ordinal: number,
  contentHash: string,
  content: string,
  passageIndices: number[],
) {
  return db.query(
    `INSERT INTO knowledge_chunk(id,user_id,item_id,ordinal,content_hash,content,passage_indices)
          VALUES($1,$2,$3,$4,$5,$6,$7::integer[])`,
    [chunkId, userId, itemId, ordinal, contentHash, content, passageIndices],
  );
}

export function selectUnanalyzedChunks(
  db: Queryable,
  itemId: string,
  userId: string,
  limit: number,
) {
  return db.query<{ id: string; content: string }>(
    'SELECT id,content FROM knowledge_chunk WHERE item_id=$1 AND user_id=$2 AND analysis IS NULL ORDER BY ordinal LIMIT $3',
    [itemId, userId, limit],
  );
}

export function saveChunkAnalysis(
  db: Queryable,
  chunkId: string,
  analysisJson: string,
  userId: string,
) {
  return db.query('UPDATE knowledge_chunk SET analysis=$2::jsonb WHERE id=$1 AND user_id=$3', [
    chunkId,
    analysisJson,
    userId,
  ]);
}

export function selectUnembeddedChunks(
  db: Queryable,
  itemId: string,
  userId: string,
  limit: number,
) {
  return db.query<{ id: string; content: string }>(
    'SELECT id,content FROM knowledge_chunk WHERE item_id=$1 AND user_id=$2 AND embedding IS NULL ORDER BY ordinal LIMIT $3',
    [itemId, userId, limit],
  );
}

export function saveChunkEmbeddings(
  db: Queryable,
  ids: string[],
  vectors: string[],
  userId: string,
  model: string,
) {
  return db.query(
    'UPDATE knowledge_chunk c SET embedding=v.embedding::vector,embedding_model=$4 FROM unnest($1::uuid[],$2::text[]) AS v(id,embedding) WHERE c.id=v.id AND c.user_id=$3',
    [ids, vectors, userId, model],
  );
}

export function readChunkSummaries(db: Queryable, itemId: string, userId: string) {
  return db.query<{ summary: string }>(
    "SELECT analysis->>'summary' AS summary FROM knowledge_chunk WHERE item_id=$1 AND user_id=$2 ORDER BY ordinal",
    [itemId, userId],
  );
}

export function readChunkTags(db: Queryable, itemId: string, userId: string) {
  return db.query<{ tags: string[] }>(
    "SELECT analysis->'tags' AS tags FROM knowledge_chunk WHERE item_id=$1 AND user_id=$2",
    [itemId, userId],
  );
}
