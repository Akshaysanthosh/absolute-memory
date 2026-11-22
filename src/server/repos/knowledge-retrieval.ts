import type { Queryable } from '@/server/db';
export type EvidenceRow = {
  id: string;
  item_id: string;
  title: string;
  content: string;
  passage_index: number;
  score: number;
} & Record<string, unknown>;

const evidenceJoins =
  'FROM knowledge_chunk c JOIN item i ON i.id=c.item_id AND i.user_id=c.user_id JOIN knowledge_job j ON j.item_id=i.id AND j.user_id=i.user_id';
const evidenceColumns = 'c.id,c.item_id,i.title,c.content,c.passage_indices[1] AS passage_index';

function filterEvidence(excludeChatNotes: boolean) {
  return `${excludeChatNotes ? 'i.origin_turn_id IS NULL AND ' : ''}c.user_id=$1 AND i.user_id=$1 AND (j.stage<>'chunks' OR j.state IN ('ready','skipped','failed')) AND i.status='ready' AND NOT i.archived AND (cardinality($2::uuid[])=0 OR i.id=ANY($2::uuid[])) AND (cardinality($3::text[])=0 OR EXISTS(SELECT 1 FROM knowledge_tag t WHERE t.user_id=$1 AND t.item_id=i.id AND t.origin!='dismissed' AND t.name=ANY($3::text[])))`;
}

export function findLexicalEvidence(
  db: Queryable,
  userId: string,
  itemIds: string[],
  tags: string[],
  terms: string,
  excludeChatNotes: boolean,
) {
  const where = filterEvidence(excludeChatNotes);
  return db.query<EvidenceRow>(
    `SELECT ${evidenceColumns},ts_rank_cd(c.search,websearch_to_tsquery('english',$4))+ts_rank(to_tsvector('english',i.title),websearch_to_tsquery('english',$4)) AS score ${evidenceJoins} WHERE ${where} AND (c.search @@ websearch_to_tsquery('english',$4) OR to_tsvector('english',i.title) @@ websearch_to_tsquery('english',$4)) ORDER BY score DESC,c.ordinal LIMIT 24`,
    [userId, itemIds, tags, terms],
  );
}

export function findSemanticEvidence(
  db: Queryable,
  userId: string,
  itemIds: string[],
  tags: string[],
  vectorJson: string,
  excludeChatNotes: boolean,
) {
  const where = filterEvidence(excludeChatNotes);
  return db.query<EvidenceRow>(
    `SELECT ${evidenceColumns},1-(c.embedding <=> $4::vector) AS score ${evidenceJoins} WHERE ${where} AND c.embedding IS NOT NULL AND 1-(c.embedding <=> $4::vector)>=0.35 ORDER BY c.embedding <=> $4::vector,c.ordinal LIMIT 24`,
    [userId, itemIds, tags, vectorJson],
  );
}

export function findGraphEvidence(
  db: Queryable,
  userId: string,
  itemIds: string[],
  tags: string[],
  matchedIds: string[],
  excludeChatNotes: boolean,
) {
  const where = filterEvidence(excludeChatNotes);
  return db.query<EvidenceRow>(
    `SELECT DISTINCT ${evidenceColumns},0.5 AS score ${evidenceJoins} WHERE ${where} AND EXISTS(SELECT 1 FROM knowledge_mention m WHERE m.chunk_id=c.id AND m.user_id=$1 AND (m.entity_id=ANY($4::uuid[]) OR m.entity_id IN (SELECT target_id FROM knowledge_edge WHERE user_id=$1 AND source_id=ANY($4::uuid[])) OR m.entity_id IN (SELECT source_id FROM knowledge_edge WHERE user_id=$1 AND target_id=ANY($4::uuid[])))) LIMIT 24`,
    [userId, itemIds, tags, matchedIds],
  );
}

export function findScopedEvidence(
  db: Queryable,
  userId: string,
  itemIds: string[],
  tags: string[],
  excludeChatNotes: boolean,
) {
  const where = filterEvidence(excludeChatNotes);
  return db.query<EvidenceRow>(
    `SELECT DISTINCT ON(i.id) ${evidenceColumns} ${evidenceJoins} WHERE ${where} ORDER BY i.id,c.ordinal LIMIT 12`,
    [userId, itemIds, tags],
  );
}

export function findRecentEvidence(
  db: Queryable,
  userId: string,
  itemIds: string[],
  tags: string[],
  excludedIds: string[],
  limit: number,
  excludeChatNotes: boolean,
) {
  const where = filterEvidence(excludeChatNotes);
  return db.query<EvidenceRow>(
    `SELECT * FROM (SELECT DISTINCT ON(i.id) ${evidenceColumns},COALESCE(i.last_read_at,i.created_at) AS seen ${evidenceJoins} WHERE ${where} AND NOT(i.id=ANY($4::uuid[])) ORDER BY i.id,c.ordinal) x ORDER BY seen DESC LIMIT $5`,
    [userId, itemIds, tags, excludedIds, limit],
  );
}

export function findLexicalPassages(
  db: Queryable,
  userId: string,
  chunkIds: string[],
  terms: string,
) {
  return db.query<{ id: string; passage_index: number }>(
    `
   SELECT DISTINCT ON (c.id) c.id, passage.index AS passage_index
   FROM knowledge_chunk c JOIN item i ON i.id=c.item_id AND i.user_id=c.user_id
   CROSS JOIN LATERAL unnest(c.passage_indices) AS passage(index)
   CROSS JOIN LATERAL (SELECT to_tsvector('english',i.passages->passage.index->>'text') AS words,
     websearch_to_tsquery('english',$3) AS query) AS lexical
   WHERE c.user_id=$1 AND c.id=ANY($2::uuid[]) AND lexical.words @@ lexical.query
   ORDER BY c.id, ts_rank_cd(lexical.words,lexical.query) DESC, passage.index`,
    [userId, chunkIds, terms],
  );
}

export function findRelatedEvidence(db: Queryable, userId: string, itemId: string) {
  return db.query<EvidenceRow & { topics: string[] }>(
    `WITH center AS (SELECT avg(embedding) AS embedding FROM knowledge_chunk WHERE user_id=$1 AND item_id=$2), candidates AS (
 SELECT c.id,c.item_id,i.title,c.content,c.passage_indices[1] AS passage_index,COALESCE(1-(c.embedding <=> center.embedding),0) AS similarity,
 ARRAY(SELECT t.name FROM knowledge_tag t JOIN knowledge_tag own ON own.name=t.name AND own.item_id=$2 AND own.user_id=$1 AND own.origin!='dismissed' WHERE t.item_id=i.id AND t.user_id=$1 AND t.origin!='dismissed') AS topics
 FROM knowledge_chunk c JOIN item i ON i.id=c.item_id AND i.user_id=c.user_id JOIN knowledge_job j ON j.item_id=i.id CROSS JOIN center WHERE c.user_id=$1 AND c.item_id!=$2 AND NOT i.archived AND j.state='ready'
 ), best AS (SELECT DISTINCT ON(item_id) *,similarity+0.1*cardinality(topics) AS score FROM candidates WHERE similarity>=0.45 OR cardinality(topics)>0 ORDER BY item_id,similarity DESC)
 SELECT * FROM best ORDER BY score DESC LIMIT 5`,
    [userId, itemId],
  );
}

export function findCitedContent(
  db: Queryable,
  userId: string,
  itemIds: string[],
  quotes: string[],
) {
  return db.query<{ item_id: string; passage_indices: number[]; content: string }>(
    `SELECT item_id, passage_indices, content FROM knowledge_chunk
   WHERE user_id=$1 AND item_id=ANY($2::uuid[]) AND content=ANY($3::text[])`,
    [userId, itemIds, quotes],
  );
}
