import type { Queryable } from '@/server/db';

export type KnowledgeJob = {
  summary: string;
  item_id: string;
  user_id: string;
  lease: string;
  revision: number;
  stage: string;
  attempts: number;
  summary_parts: string[] | null;
} & Record<string, unknown>;

export function readKnowledgeJob(db: Queryable, itemId: string, userId: string) {
  return db.query<{ state: string; stage: string; error: string | null; summary: string }>(
    'SELECT state,stage,error,summary FROM knowledge_job WHERE item_id=$1 AND user_id=$2',
    [itemId, userId],
  );
}

export function retryFailedKnowledge(db: Queryable, itemId: string, userId: string) {
  return db.query(
    "UPDATE knowledge_job SET state='queued',attempts=0,error=NULL,available_at=now() WHERE item_id=$1 AND user_id=$2 AND state='failed'",
    [itemId, userId],
  );
}

export function countPendingKnowledge(db: Queryable, userId: string) {
  return db.query<{ count: string }>(
    "SELECT count(*) FROM knowledge_job j JOIN item i ON i.id=j.item_id WHERE j.user_id=$1 AND NOT i.archived AND j.state IN ('queued','running')",
    [userId],
  );
}

export function lockQueuedKnowledgeJob(db: Queryable, userId: string | null) {
  return db.query<KnowledgeJob>(
    `SELECT j.* FROM knowledge_job j JOIN item i ON i.id=j.item_id WHERE i.status='ready' AND ($1::text IS NULL OR j.user_id=$1) AND ((j.state='queued' AND j.available_at<=now()) OR (j.state='running' AND j.locked_at<now()-interval '3 minutes')) ORDER BY j.available_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
    [userId],
  );
}

export function assignKnowledgeLease(db: Queryable, itemId: string, lease: string) {
  return db.query<KnowledgeJob>(
    "UPDATE knowledge_job SET state='running',lease=$2,locked_at=now(),attempts=attempts+1 WHERE item_id=$1 RETURNING *",
    [itemId, lease],
  );
}

export function lockKnowledgeJobLease(
  db: Queryable,
  itemId: string,
  lease: string,
  revision: number,
) {
  return db.query(
    'SELECT item_id FROM knowledge_job WHERE item_id=$1 AND lease=$2 AND revision=$3 FOR UPDATE',
    [itemId, lease, revision],
  );
}

export function releaseKnowledgeJob(db: Queryable, itemId: string) {
  return db.query(
    "UPDATE knowledge_job SET state=CASE WHEN state IN ('ready','skipped') THEN state ELSE 'queued' END,lease=NULL,attempts=0,error=NULL,available_at=now(),updated_at=now() WHERE item_id=$1",
    [itemId],
  );
}

export function startKnowledgeEnrichment(db: Queryable, itemId: string, contentHash: string) {
  return db.query("UPDATE knowledge_job SET content_hash=$2,stage='enrich' WHERE item_id=$1", [
    itemId,
    contentHash,
  ]);
}

export function finishKnowledgeEnrichment(
  db: Queryable,
  itemId: string,
  state: 'ready' | 'skipped',
) {
  return db.query("UPDATE knowledge_job SET state=$2,stage='complete' WHERE item_id=$1", [
    itemId,
    state,
  ]);
}

export function saveSummaryParts(db: Queryable, itemId: string, partsJson: string) {
  return db.query(
    "UPDATE knowledge_job SET stage='summary',summary_parts=$2::jsonb WHERE item_id=$1",
    [itemId, partsJson],
  );
}

export function completeKnowledgeSummary(db: Queryable, itemId: string, summary: string) {
  return db.query(
    "UPDATE knowledge_job SET state='ready',stage='complete',summary=$2,summary_parts=NULL WHERE item_id=$1",
    [itemId, summary],
  );
}

export function failOrRetryKnowledgeJob(
  db: Queryable,
  itemId: string,
  lease: string,
  state: 'queued' | 'failed',
  error: string,
  revision: number,
) {
  return db.query(
    "UPDATE knowledge_job SET state=$3,error=$4,lease=NULL,available_at=now()+interval '30 seconds',updated_at=now() WHERE item_id=$1 AND lease=$2 AND revision=$5",
    [itemId, lease, state, error, revision],
  );
}

export function queueSkippedKnowledgeJobs(db: Queryable, userId: string | null) {
  return db.query(
    "UPDATE knowledge_job SET state='queued',stage='enrich',available_at=now() WHERE state='skipped' AND ($1::text IS NULL OR user_id=$1)",
    [userId],
  );
}
