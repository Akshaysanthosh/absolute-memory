import { recordCall } from '@/server/services/knowledge/usage';
import {
  upsertKnowledgeEntity,
  insertKnowledgeMention,
  insertKnowledgeEdge,
} from '@/server/repos/knowledge-graph';
import {
  lockQueuedKnowledgeJob,
  assignKnowledgeLease,
  lockKnowledgeJobLease,
  releaseKnowledgeJob,
  startKnowledgeEnrichment,
  finishKnowledgeEnrichment,
  saveSummaryParts,
  completeKnowledgeSummary,
  failOrRetryKnowledgeJob,
  queueSkippedKnowledgeJobs,
  type KnowledgeJob,
} from '@/server/repos/knowledge-jobs';
import { lockOwnedItem } from '@/server/repos/items';
import {
  readChunkingSource,
  deleteItemChunks,
  insertKnowledgeChunk,
  selectUnanalyzedChunks,
  saveChunkAnalysis,
  selectUnembeddedChunks,
  saveChunkEmbeddings,
  readChunkSummaries,
  readChunkTags,
} from '@/server/repos/knowledge-chunks';
import { findExistingKnowledgeTags, addInferredKnowledgeTag } from '@/server/repos/item-tags';
import { ensureEmbeddingProfile } from '@/server/repos/embedding-profile';
import { embeddingAvailability } from '@/server/services/embeddings';
import { logEvent } from '@/server/logging/events';
import { getConfig } from '@/server/config';
import { canonicalTag, usefulAutomaticTag } from '@/shared/tag-names';
import { randomUUID } from 'node:crypto';
import { getDatabase, type Database, type Queryable } from '@/server/db';
import { chunksFor, contentHash, normalizedTag } from '@/server/services/knowledge/content';
import {
  StructuredOutputError,
  liveKnowledgeProvider,
  type KnowledgeProvider,
  type Measured,
  type Analysis,
} from '@/server/providers';
/** Sections analyzed concurrently in one step. Each call is recorded and committed under the job lease. */
export const ANALYSIS_CONCURRENCY = 3;
/** Sections embedded in one provider request. Sections are at most ~800 tokens, far below the embedding request limits. */
export const EMBEDDING_BATCH = 64;
async function entities(
  tx: Queryable,
  job: KnowledgeJob,
  chunkId: string,
  text: string,
  a: Analysis,
) {
  const ids = new Map<string, string>();
  for (const e of a.entities) {
    if (!e.evidence.trim() || !text.includes(e.evidence)) continue;
    const name = e.name.trim().toLowerCase();
    if (!name) continue;
    const rows = await upsertKnowledgeEntity(
      tx,
      randomUUID(),
      job.user_id,
      name,
      e.type.trim().toLowerCase(),
    );
    const id = rows.rows[0].id;
    ids.set(name, id);
    await insertKnowledgeMention(tx, job.user_id, id, chunkId, e.evidence);
  }
  for (const e of a.relationships) {
    const source = ids.get(e.source.trim().toLowerCase()),
      target = ids.get(e.target.trim().toLowerCase());
    if (!source || !target || source === target || !e.evidence.trim() || !text.includes(e.evidence))
      continue;
    await insertKnowledgeEdge(
      tx,
      randomUUID(),
      job.user_id,
      source,
      target,
      chunkId,
      e.label,
      e.evidence,
    );
  }
}
export async function processKnowledge(
  db: Database,
  provider: KnowledgeProvider = liveKnowledgeProvider,
  userId?: string,
) {
  const job = await db.transaction(async (tx) => {
    const r = await lockQueuedKnowledgeJob(tx, userId || null);
    const j = r.rows[0];
    if (!j) return null;
    return (await assignKnowledgeLease(tx, j.item_id, randomUUID())).rows[0];
  });
  if (!job) return false;
  // `release` hands the job back to the queue. A step that still has to report a
  // failure keeps the lease so the failure handler below can record it.
  const commit = async (fn: (tx: Queryable) => Promise<void>, release = true) =>
    db.transaction(async (tx) => {
      // Lock source first: item updates and their invalidation trigger use the same lock order.
      await lockOwnedItem(tx, job.item_id, job.user_id);
      const valid = await lockKnowledgeJobLease(tx, job.item_id, job.lease, job.revision);
      if (!valid.rows.length) return;
      await fn(tx);
      if (release) await releaseKnowledgeJob(tx, job.item_id);
    });
  try {
    const config = getConfig();
    const live = provider === liveKnowledgeProvider;
    const chat = !live || Boolean(config.AI_BASE_URL && config.AI_MODEL);
    const embedding = !live || (await embeddingAvailability(db)).enabled;
    if (job.attempts > 3) throw new Error('Retry budget exhausted');
    if (job.stage === 'chunks') {
      const {
        rows: [item],
      } = await readChunkingSource(db, job.item_id, job.user_id);
      if (!item) return true;
      const chunks = chunksFor(item.passages);
      await commit(async (tx) => {
        await deleteItemChunks(tx, job.item_id, job.user_id);
        for (const chunk of chunks) {
          await insertKnowledgeChunk(
            tx,
            chunk.id,
            job.user_id,
            job.item_id,
            chunk.ordinal,
            chunk.content_hash,
            chunk.content,
            chunk.passageIndices,
          );
        }
        await startKnowledgeEnrichment(tx, job.item_id, contentHash(item.title, item.passages));
      });
      return true;
    }
    // Analysis precedes embedding, as before; each stage now handles several sections per step.
    const unanalyzed = chat
      ? (await selectUnanalyzedChunks(db, job.item_id, job.user_id, ANALYSIS_CONCURRENCY)).rows
      : [];
    if (unanalyzed.length) {
      const settled = await Promise.allSettled(
        unanalyzed.map(async (c) => {
          const started = Date.now();
          let measured: Measured<Analysis> | null = null,
            failure: unknown = false;
          try {
            measured = await provider.analyze(c.content);
            return measured.value;
          } catch (error) {
            failure = error;
            throw error;
          } finally {
            await recordCall(
              db,
              job.user_id,
              'organization',
              started,
              measured,
              failure,
              live ? config.AI_MODEL : undefined,
            );
          }
        }),
      );
      const analyzed = unanalyzed.flatMap((c, i) => {
        const s = settled[i];
        return s.status === 'fulfilled' ? [{ c, analysis: s.value }] : [];
      });
      const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      // Paid results are kept even when a sibling section fails; the failure then follows the usual retry rules.
      if (analyzed.length)
        await commit(async (tx) => {
          for (const { c, analysis } of analyzed) {
            await saveChunkAnalysis(tx, c.id, JSON.stringify(analysis), job.user_id);
            await entities(tx, job, c.id, c.content, analysis);
          }
        }, !failed);
      if (failed) throw failed.reason;
      return true;
    }
    const unembedded = embedding
      ? (await selectUnembeddedChunks(db, job.item_id, job.user_id, EMBEDDING_BATCH)).rows
      : [];
    if (unembedded.length) {
      const started = Date.now();
      let measured: Measured<number[][]> | null = null,
        failure: unknown = false;
      try {
        const result = await provider.embed(unembedded.map((c) => c.content));
        measured = result;
        const dimension = result.value[0]?.length;
        if (
          !dimension ||
          result.value.length !== unembedded.length ||
          result.value.some(
            (vector) =>
              vector.length !== dimension || vector.some((value) => !Number.isFinite(value)),
          )
        ) {
          throw new Error('Invalid embedding.');
        }
        const compatible = !live || (await ensureEmbeddingProfile(db, result.model, dimension));
        if (compatible) {
          await commit(async (tx) => {
            await saveChunkEmbeddings(
              tx,
              unembedded.map((c) => c.id),
              result.value.map((v) => JSON.stringify(v)),
              job.user_id,
              result.model,
            );
          });
        } else {
          await commit(async () => {});
        }
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        await recordCall(
          db,
          job.user_id,
          'embedding',
          started,
          measured,
          failure,
          live ? config.EMBEDDINGS_MODEL : undefined,
        );
      }
      return true;
    }
    if (!chat || job.summary) {
      await commit(async (tx) => {
        await finishKnowledgeEnrichment(tx, job.item_id, chat || embedding ? 'ready' : 'skipped');
      });
      return true;
    }
    let parts = job.summary_parts;
    if (parts === null) {
      const data = await readChunkSummaries(db, job.item_id, job.user_id);
      parts = data.rows.map((c) => c.summary);
    }
    let count = 0,
      size = 0;
    while (count < parts.length && (size + parts[count].length < 12000 || count === 0)) {
      size += parts[count].length;
      count++;
    }
    const started = Date.now();
    let measured: Measured<string> | null = null,
      failure: unknown = false;
    try {
      measured = parts.length
        ? await provider.summarize(parts.slice(0, count).join('\n\n'))
        : {
            value: 'No readable text to organize.',
            model: 'none',
            inputTokens: 0,
            outputTokens: 0,
          };
      const summary = measured.value;
      await commit(async (tx) => {
        if (count < parts!.length) {
          await saveSummaryParts(
            tx,
            job.item_id,
            JSON.stringify([...parts!.slice(count), summary]),
          );
          return;
        }
        const rows = await readChunkTags(tx, job.item_id, job.user_id);
        const freq = new Map<string, number>();
        for (const row of rows.rows)
          for (const tag of row.tags) {
            const name = canonicalTag(tag);
            if (name && usefulAutomaticTag(name)) freq.set(name, (freq.get(name) || 0) + 1);
          }
        // Prefer names already used elsewhere in this library, so related items share a tag instead of each getting a new one.
        const known = new Set(
          (
            await findExistingKnowledgeTags(tx, job.user_id, job.item_id, [...freq.keys()])
          ).rows.map((r) => r.name),
        );
        for (const [tag] of [...freq]
          .sort((a, b) => Number(known.has(b[0])) - Number(known.has(a[0])) || b[1] - a[1])
          .slice(0, 4))
          await addInferredKnowledgeTag(tx, job.user_id, job.item_id, tag);
        await completeKnowledgeSummary(tx, job.item_id, summary);
      });
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await recordCall(
        db,
        job.user_id,
        'summary',
        started,
        measured,
        failure,
        live ? config.AI_MODEL : undefined,
      );
    }
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode;
    const permanent = status === 401 || status === 403 || status === 400 || job.attempts >= 3;
    const structuredFailure = e instanceof StructuredOutputError;
    const final = permanent || structuredFailure;
    const message = structuredFailure
      ? 'Summary failed: model returned invalid JSON. Retry after checking the provider.'
      : final
        ? 'Organization could not finish. Please retry later.'
        : 'Organization will retry shortly.';
    logEvent('error', final ? 'knowledge.organization_failed' : 'knowledge.organization_retry', e);
    await failOrRetryKnowledgeJob(
      db,
      job.item_id,
      job.lease,
      final ? 'failed' : 'queued',
      message,
      job.revision,
    );
  }
  return true;
}
const runtime = globalThis as unknown as { knowledgeBusy?: boolean };
export async function runKnowledgeBatch(userId?: string, database?: Database) {
  if (runtime.knowledgeBusy) return 0;
  runtime.knowledgeBusy = true;
  try {
    const db = database || (await getDatabase());
    const config = getConfig();
    if ((config.AI_BASE_URL && config.AI_MODEL) || (await embeddingAvailability(db)).enabled) {
      await queueSkippedKnowledgeJobs(db, userId ?? null);
    }
    const start = Date.now();
    let count = 0;
    while (
      count < 12 &&
      Date.now() - start < 20_000 &&
      (await processKnowledge(db, liveKnowledgeProvider, userId))
    ) {
      count++;
    }
    return count;
  } finally {
    runtime.knowledgeBusy = false;
  }
}
