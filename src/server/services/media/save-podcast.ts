import { lockUser } from '@/server/repos/users';
import { findMediaFingerprint, insertPodcastMediaSource } from '@/server/repos/media-sources';
import {
  findConvertedPodcastUrl,
  convertExistingItemToPodcast,
  insertPodcastItem,
  storePodcastDescription,
} from '@/server/repos/media-items';
import { supersedePodcastImport, queuePodcastImport } from '@/server/repos/import-jobs';
import { randomUUID } from 'node:crypto';
import { recordSource } from '@/server/services/source-raw';
import { normalizeUrl } from '@/server/services/extract';
import { getDatabase, type Database } from '@/server/db';
import { HttpError } from '@/server/auth/http';
import type { Episode } from '@/server/services/media/podcast';

export async function savePodcast(
  userId: string,
  input: { episode: Episode; sourceUrl?: string; expectedItemId?: string },
  database?: Database,
  channel = 'web',
) {
  const db = database || (await getDatabase()),
    episode = input.episode;
  const sourceUrl = input.sourceUrl ? normalizeUrl(input.sourceUrl) : null;
  const fingerprint = `podcast:${episode.id}`;
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = (await findMediaFingerprint(tx, userId, fingerprint)).rows[0];
    if (existing) return { id: existing.item_id, duplicate: true };
    const previous = sourceUrl
      ? (await findConvertedPodcastUrl(tx, userId, sourceUrl)).rows[0]
      : undefined;
    if ('expectedItemId' in input && input.expectedItemId && previous?.id !== input.expectedItemId)
      throw new HttpError(404, 'This item was not found.');
    if (previous && (previous.status === 'ready' || previous.has_media))
      return { id: previous.id, duplicate: true };
    // Invalidate and lock an old extraction lease before updating its item.
    if (previous) await supersedePodcastImport(tx, previous.id);
    const id = previous?.id || randomUUID(),
      title = episode.title;
    if (previous) await convertExistingItemToPodcast(tx, id, userId, title, episode.author || null);
    else
      await insertPodcastItem(
        tx,
        id,
        userId,
        title,
        'Podcast',
        episode.author || null,
        channel,
        sourceUrl,
      );
    await insertPodcastMediaSource(
      tx,
      id,
      userId,
      episode.audioUrl,
      episode.transcriptUrl,
      episode.duration,
      fingerprint,
    );
    await storePodcastDescription(tx, id, userId, episode.description ?? null);
    await recordSource(tx, id, userId, 'podcast', {
      title: episode.title,
      author: episode.author,
      description: episode.description,
      publishedAt: episode.publishedAt,
      duration: episode.duration,
      link: episode.link,
      audioUrl: episode.audioUrl,
      transcriptUrl: episode.transcriptUrl,
    });
    await queuePodcastImport(tx, randomUUID(), id);
    return { id, duplicate: !!previous };
  });
}
