import { findItemMedia, ensureSocialMediaSource } from '@/server/repos/media-sources';
import { updateFailedItemError, markItemPendingIfFailed } from '@/server/repos/items';
import { setRetrySocialPlatform } from '@/server/repos/item-capture';
import { retryFailedImport } from '@/server/repos/import-jobs';
import { getDatabase, type Database } from '@/server/db';
import { ownItem } from '@/server/services/library';
import { captureSource } from '@/server/services/capture-source';
import { isPodcastLink, resolvePodcastLink } from '@/server/services/media/podcast-links';
import { HttpError } from '@/server/auth/http';
import { socialVideoPlatform } from '@/shared/media/social';

/** Explicit retries preserve ownership and repair legacy podcast URLs through source recognition. */
export async function retryImport(
  userId: string,
  itemId: string,
  database?: Database,
  resolve = resolvePodcastLink,
) {
  const db = database || (await getDatabase()),
    item = await ownItem(userId, itemId, db);
  if (item.status !== 'failed') return;

  if (
    item.url &&
    isPodcastLink(item.url) &&
    !(await findItemMedia(db, itemId, userId)).rows.length
  ) {
    try {
      const saved = await captureSource(
        userId,
        { kind: 'article', url: item.url },
        'web',
        db,
        resolve,
        itemId,
      );
      if (saved.item.id !== itemId)
        throw new HttpError(
          409,
          `This episode is already saved as “${saved.item.title}”. Open its existing podcast card in your library.`,
        );
    } catch (error) {
      if (error instanceof HttpError && [409, 422].includes(error.status))
        await updateFailedItemError(db, itemId, userId, error.message.slice(0, 400));
      throw error;
    }
    return;
  }
  await db.transaction(async (tx) => {
    const platform = socialVideoPlatform(item.url);
    if (platform) {
      await ensureSocialMediaSource(tx, itemId, userId);
      await setRetrySocialPlatform(tx, itemId, userId, platform);
    }
    await retryFailedImport(tx, itemId);
    await markItemPendingIfFailed(tx, itemId, userId);
  });
}
