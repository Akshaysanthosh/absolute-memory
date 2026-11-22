import { getDatabase } from '@/server/db';
import { deleteOwnedItem, updateItemState, updateItemTitle } from '@/server/repos/items';
import { saveAsBookmark } from '@/server/services/bookmarks';
import { assertItemOwner } from '@/server/services/library';
import { retryImport } from '@/server/services/retry-import';

type ItemUpdate = {
  title?: string;
  favorite?: boolean;
  archived?: boolean;
  progress?: number;
  retry?: boolean;
  bookmark?: true;
  bookmarkType?: 'website' | 'product';
};

export async function updateLibraryItem(userId: string, id: string, input: ItemUpdate) {
  await assertItemOwner(userId, id);
  const db = await getDatabase();
  const retry = !!input.retry && !input.bookmark && !input.bookmarkType;
  if (retry) await retryImport(userId, id, db);
  await db.transaction(async (tx) => {
    if (input.title !== undefined) await updateItemTitle(tx, id, userId, input.title);
    if (input.bookmark || input.bookmarkType)
      await saveAsBookmark(tx, userId, id, input.bookmarkType);
    await updateItemState(tx, id, userId, input);
  });
  return { retry };
}

export async function removeLibraryItem(userId: string, id: string) {
  await assertItemOwner(userId, id);
  await deleteOwnedItem(await getDatabase(), id, userId);
}
