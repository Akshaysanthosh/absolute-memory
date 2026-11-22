import { randomUUID } from 'node:crypto';
import type { Queryable } from '@/server/db';
import type { Measured } from '@/server/providers';
import { insertKnowledgeUsage } from '@/server/repos/knowledge-usage';
import { knowledgeFailure } from './failure';

export async function recordCall(
  db: Queryable,
  userId: string,
  feature: string,
  started: number,
  result: Measured<unknown> | null,
  error: unknown = false,
  requestedModel?: string,
) {
  const failure = error ? knowledgeFailure(error) : null;
  await insertKnowledgeUsage(
    db,
    randomUUID(),
    userId,
    feature,
    result?.model || requestedModel || 'unavailable',
    result?.inputTokens ?? failure?.inputTokens ?? 0,
    result?.outputTokens ?? failure?.outputTokens ?? 0,
    Date.now() - started,
    failure?.code || null,
  );
}
