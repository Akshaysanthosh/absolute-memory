import { readItemStatus } from '@/server/repos/items';
import { getDatabase, type Queryable } from '@/server/db';
import { HttpError, resourceId } from '@/server/auth/http';
import { attachMediaReadiness } from '@/server/services/media/readiness';
import { itemIsReady, preparationFailed } from '@/shared/item-readiness';

/** Status polling must not fetch article passages, originals, or transcript text. */
export async function itemPreparationStatus(userId: string, id: string, database?: Queryable) {
  resourceId(id);
  const db = database ?? (await getDatabase());
  const { rows } = await readItemStatus(db, id, userId);
  if (!rows[0]) throw new HttpError(404, 'This item was not found.');
  const [item] = await attachMediaReadiness(rows, userId, db);
  return {
    ready: itemIsReady(item),
    failed: preparationFailed(item),
    knowledgeState: item.knowledge_state ?? null,
  };
}
