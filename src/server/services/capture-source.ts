import type { z } from 'zod';
import type { Database } from '@/server/db';
import { getDatabase } from '@/server/db';
import { capture, captureSchema, ownItem } from '@/server/services/library';
import { HttpError } from '@/server/auth/http';
import { isPodcastLink, resolvePodcastLink } from '@/server/services/media/podcast-links';
import { savePodcast } from '@/server/services/media/save-podcast';
import { MediaError } from '@/shared/media/transcript';
import { normalizeUrl } from '@/server/services/extract';
/** Shared capture ingress: a podcast episode is never imported as webpage text. */
export async function captureSource(
  userId: string,
  input: z.infer<typeof captureSchema>,
  channel = 'web',
  database?: Database,
  resolve = resolvePodcastLink,
  expectedItemId?: string,
) {
  if (input.kind !== 'article' || !isPodcastLink(input.url))
    return capture(userId, input, channel, database);
  const url = new URL(input.url);
  const episodeLink =
    url.hostname === 'open.spotify.com'
      ? /^\/episode\/[A-Za-z0-9]{22}\/?$/.test(url.pathname)
      : /^\d+$/.test(url.searchParams.get('i') || '');
  if (!episodeLink)
    throw new HttpError(
      422,
      'Save a specific podcast episode link, or use Add content → Podcast to select an episode from its public feed.',
    );
  const db = database || (await getDatabase());

  let episodes;
  try {
    episodes = await resolve(input.url);
  } catch (error) {
    throw new HttpError(
      422,
      error instanceof MediaError
        ? error.message
        : 'This public podcast episode could not be resolved. Try its RSS feed in Add content → Podcast.',
    );
  }
  if (episodes.length !== 1)
    throw new HttpError(
      422,
      'This link does not identify one public episode. Choose it in Add content → Podcast.',
    );
  const saved = await savePodcast(
    userId,
    { episode: episodes[0], sourceUrl: normalizeUrl(input.url), expectedItemId },
    db,
    channel,
  );
  return { item: await ownItem(userId, saved.id, db), duplicate: saved.duplicate };
}
