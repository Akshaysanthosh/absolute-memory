import type { Queryable } from '@/server/db';

export function insertKnowledgeUsage(
  db: Queryable,
  id: string,
  userId: string,
  feature: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  durationMs: number,
  error: string | null,
) {
  return db.query(
    'INSERT INTO knowledge_usage(id,user_id,feature,model,input_tokens,output_tokens,duration_ms,error) SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE EXISTS(SELECT 1 FROM "user" WHERE id=$2)',
    [id, userId, feature, model, inputTokens, outputTokens, durationMs, error],
  );
}
