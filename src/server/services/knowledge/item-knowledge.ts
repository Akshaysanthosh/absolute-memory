import { findRelatedEvidence } from '@/server/repos/knowledge-retrieval';
import { readKnowledgeJob, retryFailedKnowledge } from '@/server/repos/knowledge-jobs';
import { readChunkProgress } from '@/server/repos/knowledge-chunks';
import {
  listItemTags,
  readTagLimit,
  upsertManualTag,
  dismissTagsNotIn,
} from '@/server/repos/item-tags';
import { lockOwnedItem } from '@/server/repos/items';
import { getDatabase, type Database } from '@/server/db';
import { HttpError, resourceId } from '@/server/auth/http';
import { assertItemOwner } from '@/server/services/library';
import { normalizedTag } from './content';
import type { KnowledgeInfo } from '@/shared/knowledge/shared';

export async function knowledgeInfo(
  userId: string,
  itemId: string,
  database?: Database,
): Promise<KnowledgeInfo> {
  const db = database || (await getDatabase());
  await assertItemOwner(userId, itemId, db);
  const [jobs, tags, counts] = await Promise.all([
    readKnowledgeJob(db, itemId, userId),
    listItemTags(db, itemId, userId),
    readChunkProgress(db, itemId, userId),
  ]);
  return {
    ...(jobs.rows[0] || { state: 'queued', stage: 'waiting', error: null, summary: '' }),
    tags: tags.rows.map((t) => t.name),
    total: Number(counts.rows[0].total),
    completed: Number(counts.rows[0].completed),
  };
}
export async function addTag(userId: string, itemId: string, tag: string, database?: Database) {
  const name = normalizedTag(tag);
  if (!name) throw new HttpError(400, 'Enter a topic.');
  const db = database || (await getDatabase());
  await db.transaction(async (tx) => {
    await lockOwnedItem(tx, resourceId(itemId), userId);
    await assertItemOwner(userId, itemId, tx);
    const {
      rows: [tags],
    } = await readTagLimit(tx, itemId, userId, name);
    if (tags.count >= 20 && !tags.exists)
      throw new HttpError(422, 'Remove a tag before adding another.');
    await upsertManualTag(tx, userId, itemId, name);
  });
}
export async function setTags(userId: string, itemId: string, tags: string[], database?: Database) {
  const db = database || (await getDatabase());
  return db.transaction(async (tx) => {
    resourceId(itemId);
    await lockOwnedItem(tx, itemId, userId);
    await assertItemOwner(userId, itemId, tx);
    const names = [...new Set(tags.map(normalizedTag).filter(Boolean))];
    await dismissTagsNotIn(tx, itemId, userId, names);
    for (const name of names) await upsertManualTag(tx, userId, itemId, name);
  });
}
export async function retryKnowledge(userId: string, itemId: string, database?: Database) {
  const db = database || (await getDatabase());
  await assertItemOwner(userId, itemId, db);
  await retryFailedKnowledge(db, itemId, userId);
}
export async function related(userId: string, itemId: string, database?: Database) {
  const db = database || (await getDatabase());
  await assertItemOwner(userId, itemId, db);
  const rows = await findRelatedEvidence(db, userId, itemId);
  return rows.rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    title: r.title,
    text: r.content,
    passageIndex: r.passage_index,
    topics: r.topics,
  }));
}
