import {
  deleteSampleItems,
  hasSampleOrMatchingUrl,
  markSamplesRemoved,
  recordSamplesAdded,
  reserveWelcomeSample,
  setSampleKey,
} from '@/server/repos/samples';
import { lockUser } from '@/server/repos/users';
import { getDatabase, type Database } from '@/server/db';
import { normalizeUrl } from '@/server/services/extract';
import { youtubeVideoId } from '@/server/services/thumbnails';
import { addAutomaticTags } from '@/server/services/saved-content';
import { capture } from '@/server/services/library';
import { SAMPLE_CATALOG, WELCOME_NOTE } from '@/server/services/samples/catalog';

export async function seedNewAccount(
  db: Pick<Database, 'transaction'>,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await reserveWelcomeSample(tx, userId))) return;
    const { item } = await capture(
      userId,
      { kind: 'note', title: 'Welcome to your library', text: WELCOME_NOTE },
      'web',
      { transaction: (run) => run(tx) },
    );
    await setSampleKey(tx, userId, item.id, 'welcome');
  });
}

/** Deletes every sample in the account (with anything attached to it) and remembers the choice. */
export async function removeSamples(
  userId: string,
  db?: Pick<Database, 'transaction'>,
): Promise<number> {
  return (db ?? (await getDatabase())).transaction(async (tx) => {
    const removed = await deleteSampleItems(tx, userId);
    await markSamplesRemoved(tx, userId);
    return removed;
  });
}

export async function addSampleLinks(userId: string, db?: Pick<Database, 'transaction'>) {
  return (db ?? (await getDatabase())).transaction(async (tx) => {
    await lockUser(tx, userId);
    const added: string[] = [];
    for (const entry of SAMPLE_CATALOG) {
      if (entry.kind !== 'article' || !entry.starter) continue;
      const video = youtubeVideoId(entry.url);
      const url = video ? `https://www.youtube.com/watch?v=${video}` : normalizeUrl(entry.url);
      if (await hasSampleOrMatchingUrl(tx, userId, url, entry.key)) continue;
      const saved = await capture(userId, { kind: 'article', url }, 'web', {
        transaction: (fn) => fn(tx),
      });
      if (saved.duplicate) continue;
      await setSampleKey(tx, userId, saved.item.id, entry.key);
      await addAutomaticTags(tx, saved.item.id, entry.topics);
      added.push(entry.key);
    }
    if (added.length) await recordSamplesAdded(tx, userId, added);
    return added.length;
  });
}
