import { insertBookmarkTag } from '@/server/repos/item-tags';
import { lockItemImport, finishImportForItem } from '@/server/repos/import-jobs';
import { updateItemBookmark } from '@/server/repos/items';
import type { Queryable } from '@/server/db';
import { HttpError } from '@/server/auth/http';

export async function tagBookmark(tx: Queryable, itemId: string) {
  await insertBookmarkTag(tx, itemId);
}

export async function saveAsBookmark(
  tx: Queryable,
  userId: string,
  itemId: string,
  type?: 'website' | 'product',
) {
  // Use the same lock order as the import worker.
  await lockItemImport(tx, itemId, userId);
  const result = await updateItemBookmark(tx, itemId, userId, type ?? null);
  if (!result.rows.length) throw new HttpError(422, 'Only saved web pages can become bookmarks.');
  await finishImportForItem(tx, itemId);
  await tagBookmark(tx, itemId);
}
