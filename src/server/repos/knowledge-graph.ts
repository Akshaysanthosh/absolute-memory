import type { Queryable } from '@/server/db';
type GraphMention = {
  entity_id: string;
  name: string;
  type: string;
  item_id: string;
  chunk_id: string;
  passageIndex: number;
  evidence: string;
};
type GraphEdge = {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  evidence: string;
  item_id: string;
  passageIndex: number;
};
type GraphItem = { id: string; title: string; mentions: GraphMention[]; edges: GraphEdge[] };

export function findEntityMatches(db: Queryable, userId: string, normalizedQuery: string) {
  return db.query<{ id: string }>(
    `SELECT e.id FROM knowledge_entity e
  CROSS JOIN LATERAL (SELECT btrim(regexp_replace(lower(e.name),'[^a-z0-9]+',' ','g')) AS n) x
  WHERE e.user_id=$1 AND x.n<>'' AND (position(' '||x.n||' ' IN ' '||$2||' ')>0 OR position(' '||$2||' ' IN ' '||x.n||' ')>0)
  AND EXISTS(SELECT 1 FROM knowledge_mention m WHERE m.entity_id=e.id AND m.user_id=$1) LIMIT 50`,
    [userId, normalizedQuery],
  );
}

export function readGraphItems(
  db: Queryable,
  userId: string,
  tag: string | null,
  compact: boolean,
  nodeId: string | null,
) {
  return db.query<GraphItem>(
    `SELECT i.id,i.title,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('entity_id',e.id,'name',e.name,'type',e.type,'item_id',c.item_id,'chunk_id',c.id,'passageIndex',CASE WHEN $3::boolean THEN NULL ELSE c.passage_indices[1] END,'evidence',CASE WHEN $3::boolean THEN NULL ELSE m.evidence END) ORDER BY e.id,c.id)
   FROM knowledge_mention m JOIN knowledge_entity e ON e.id=m.entity_id AND e.user_id=m.user_id
   JOIN knowledge_chunk c ON c.id=m.chunk_id AND c.user_id=m.user_id
   WHERE c.item_id=i.id AND m.user_id=i.user_id AND ($4::uuid IS NULL OR i.id=$4 OR e.id=$4)),'[]'::jsonb) AS mentions,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'source_id',e.source_id,'target_id',e.target_id,'label',e.label,'evidence',CASE WHEN $3::boolean THEN NULL ELSE e.evidence END,'item_id',c.item_id,'passageIndex',CASE WHEN $3::boolean THEN NULL ELSE c.passage_indices[1] END) ORDER BY e.id)
   FROM knowledge_edge e JOIN knowledge_chunk c ON c.id=e.chunk_id AND c.user_id=e.user_id
   WHERE c.item_id=i.id AND e.user_id=i.user_id AND ($4::uuid IS NULL OR e.source_id=$4 OR e.target_id=$4)),'[]'::jsonb) AS edges
  FROM item i JOIN knowledge_job j ON j.item_id=i.id AND j.user_id=i.user_id
  WHERE i.user_id=$1 AND NOT i.archived AND j.state='ready'
   AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM knowledge_tag t WHERE t.item_id=i.id AND t.user_id=$1 AND t.name=$2 AND t.origin!='dismissed'))
  AND ($4::uuid IS NULL OR i.id=$4 OR EXISTS(SELECT 1 FROM knowledge_mention m JOIN knowledge_chunk c ON c.id=m.chunk_id AND c.user_id=m.user_id WHERE c.item_id=i.id AND m.user_id=$1 AND m.entity_id=$4) OR EXISTS(SELECT 1 FROM knowledge_edge e JOIN knowledge_chunk c ON c.id=e.chunk_id AND c.user_id=e.user_id WHERE c.item_id=i.id AND e.user_id=$1 AND (e.source_id=$4 OR e.target_id=$4)))
  ORDER BY i.id`,
    [userId, tag, compact, nodeId],
  );
}

export function upsertKnowledgeEntity(
  db: Queryable,
  id: string,
  userId: string,
  name: string,
  type: string,
) {
  return db.query<{ id: string }>(
    'INSERT INTO knowledge_entity(id,user_id,name,type) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,name,type) DO UPDATE SET name=EXCLUDED.name RETURNING id',
    [id, userId, name, type],
  );
}

export function insertKnowledgeMention(
  db: Queryable,
  userId: string,
  entityId: string,
  chunkId: string,
  evidence: string,
) {
  return db.query(
    'INSERT INTO knowledge_mention(user_id,entity_id,chunk_id,evidence) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [userId, entityId, chunkId, evidence],
  );
}

export function insertKnowledgeEdge(
  db: Queryable,
  id: string,
  userId: string,
  sourceId: string,
  targetId: string,
  chunkId: string,
  label: string,
  evidence: string,
) {
  return db.query(
    'INSERT INTO knowledge_edge(id,user_id,source_id,target_id,chunk_id,label,evidence) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
    [id, userId, sourceId, targetId, chunkId, label, evidence],
  );
}
