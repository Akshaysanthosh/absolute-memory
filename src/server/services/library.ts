import { captureQuote } from '@/server/services/capture-quote';
import { lockUser } from '@/server/repos/users';
import {
  writeSocialSnapshot,
  findCaptureFromTurn,
  findCaptureByUrl,
  adoptSampleItem,
  refreshSocialSnapshot,
  mergeCaptureDetails,
  repairBrowserCapture,
  insertCapture,
  finishBrowserCapture,
  setCaptureSocialPlatform,
} from '@/server/repos/item-capture';
import { findOwnedItem, findOwnedItemId, readItemWithSource } from '@/server/repos/items';
import {
  findItemMediaStage,
  ensureSocialMediaSource,
  deleteMediaSource,
  insertSocialMediaSource,
  insertYouTubeSource,
} from '@/server/repos/media-sources';
import {
  requeueImport,
  completeImportForItem,
  finishImportForItem,
  enqueueImport,
} from '@/server/repos/import-jobs';
import { reanchorHighlights } from '@/server/services/reading';
import { plainReading } from '@/server/services/import/content';
import { prepareReadingImages } from '@/server/services/import/images';
import { socialSnapshot, socialSnapshotSchema } from '@/server/services/social-capture';
import { contentPlatform, socialVideoPlatform } from '@/shared/media/social';
import { youtubeVideoId, isYouTubeUrl } from '@/server/services/thumbnails';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDatabase, type Database, type Queryable } from '@/server/db';
import { HttpError } from '@/server/auth/http';
import { normalizeUrl, extractSavedPage } from '@/server/services/extract';
import { addAutomaticTags } from '@/server/services/saved-content';
import { tagBookmark } from '@/server/services/bookmarks';
import type { Item } from '@/shared/types';
import { cleanSourceTitle } from '@/shared/content-title';
import { recordSource } from '@/server/services/source-raw';

export const captureSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('article'),
    url: z.string().url().max(4000),
    captured: z
      .object({
        html: z.string().min(1).max(400000).optional(),
        social: socialSnapshotSchema.optional(),
      })
      .refine((value) => Boolean(value.html || value.social))
      .optional(),
  }),
  z.object({
    kind: z.literal('note'),
    title: z.string().trim().min(1).max(300),
    text: z.string().trim().min(1).max(100_000),
  }),
  z.object({
    kind: z.literal('quote'),
    sourceUrl: z.string().url().max(4000),
    title: z.string().trim().max(300),
    text: z
      .string()
      .max(12000)
      .refine((value) => Boolean(value.trim())),
  }),
]);
export async function capture(
  userId: string,
  input: z.infer<typeof captureSchema>,
  channel = 'web',
  database?: Pick<Database, 'transaction'> & Partial<Queryable>,
  originTurnId?: string,
) {
  const db = database || (await getDatabase());
  if (input.kind === 'quote') return captureQuote(db, userId, input, channel);
  let url: string | null = null;
  if (input.kind === 'article') {
    try {
      url = normalizeUrl(input.url);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  if (url && ['open.spotify.com', 'podcasts.apple.com'].includes(new URL(url).hostname))
    throw new HttpError(
      422,
      'Use Add content → Podcast for this link. Public Apple/Spotify episodes are resolved through their RSS feed when available.',
    );
  const videoId = youtubeVideoId(url);
  const rawSnapshot =
    input.kind === 'article' && input.captured?.social
      ? socialSnapshot(url!, input.captured.social)
      : null;
  const snapshot = rawSnapshot && {
    ...rawSnapshot,
    title: cleanSourceTitle(rawSnapshot.title, new URL(url!).hostname),
  };
  const snapshotReading = snapshot?.reading;
  const snapshotPlatform = snapshot?.details.social?.platform;
  const socialPlatform = snapshot
    ? snapshot.video &&
      snapshotPlatform &&
      ['Instagram', 'X', 'Facebook', 'TikTok'].includes(snapshotPlatform)
      ? snapshotPlatform
      : null
    : socialVideoPlatform(url);
  if (url && !videoId && isYouTubeUrl(url))
    throw new HttpError(
      422,
      'Use a specific YouTube video link. Channels, playlists, search results and the YouTube home page cannot be imported.',
    );
  // Profiles, timelines and stories have no single post to import, and these sites only show them after sign-in.
  if (url && !snapshot && !socialPlatform && contentPlatform(url) === 'X')
    throw new HttpError(
      422,
      'Use a specific post link from X (it contains /status/). Profiles, searches and timelines cannot be imported.',
    );
  if (url && !snapshot && !socialPlatform && contentPlatform(url) === 'Instagram')
    throw new HttpError(
      422,
      /\/stories\//.test(new URL(url).pathname)
        ? 'Instagram stories need sign-in and disappear, so they cannot be imported. Save a post or reel link instead.'
        : 'Use a specific Instagram post or reel link. Profiles and other pages cannot be imported.',
    );
  if (videoId) url = `https://www.youtube.com/watch?v=${videoId}`;
  const extractCapture = () => {
    if (input.kind !== 'article' || !input.captured?.html || videoId || socialPlatform || snapshot)
      return null;
    if (Buffer.byteLength(input.captured.html) > 400000)
      throw new HttpError(413, 'This browser capture is too large.');
    try {
      return extractSavedPage(input.captured.html, url!);
    } catch {
      return null;
    }
  };
  const captured = extractCapture();
  const staged =
    captured || snapshotReading
      ? await prepareReadingImages(
          db.query ? { query: db.query.bind(db) } : await getDatabase(),
          captured?.readingHtml ?? snapshotReading?.html ?? '',
          captured?.images ?? snapshotReading?.images ?? [],
          captured?.leadImage,
        )
      : undefined;
  return db.transaction(async (tx) => {
    async function storeSnapshot(id: string) {
      if (!snapshot || !snapshotReading || !staged) return;
      const local = staged(userId, id);
      await local.attach(tx);
      await writeSocialSnapshot(tx, {
        id,
        title: snapshot.title,
        author: snapshot.author,
        excerpt: snapshot.excerpt,
        passagesJson: JSON.stringify(snapshotReading.passages),
        words: snapshot.words,
        detailsJson: JSON.stringify(snapshot.details),
        hasVideo: Boolean(socialPlatform),
        userId,
        html: local.html,
      });
      await reanchorHighlights(tx, userId, id, snapshotReading.passages);
      // The extension's own capture of the post (text, images, author) is the raw source.
      if (input.kind === 'article' && input.captured?.social)
        await recordSource(tx, id, userId, 'extension', input.captured.social);
    }
    // Serialise captures for this account to deduplicate concurrent requests.
    await lockUser(tx, userId);
    if (originTurnId) {
      const existing = await findCaptureFromTurn(tx, userId, originTurnId);
      if (existing.rows[0]) return { item: existing.rows[0], duplicate: true };
    }
    if (url) {
      const { rows } = await findCaptureByUrl(tx, userId, url);
      if (rows[0]) {
        if (rows[0].sample_key) {
          // Saving a link that is already a sample makes it the user's own save, keeping its prepared summary.
          const {
            rows: [adopted],
          } = await adoptSampleItem(tx, rows[0].id, userId, channel);
          return { item: adopted, duplicate: false };
        }
        if (
          snapshot &&
          snapshotReading &&
          staged &&
          rows[0].source_details?.social?.post &&
          rows[0].status === 'ready'
        ) {
          // Refresh an explicit browser re-save while preserving any existing transcript and manual title.
          const postOnly = Boolean(
            rows[0].source_details.social.transcriptUnavailable ||
            rows[0].source_details.social.transcriptError ||
            rows[0].bookmark_type,
          );
          const local = staged(userId, rows[0].id);
          if (postOnly) await local.attach(tx);
          const details = {
            ...rows[0].source_details,
            ...snapshot.details,
            social: { ...rows[0].source_details.social, ...snapshot.details.social },
          };
          await refreshSocialSnapshot(tx, {
            id: rows[0].id,
            userId,
            title: snapshot.title,
            author: snapshot.author,
            detailsJson: JSON.stringify(details),
            replaceReading: postOnly,
            passagesJson: JSON.stringify(snapshotReading.passages),
            excerpt: snapshot.excerpt,
            words: snapshot.words,
            html: local.html,
          });
          if (postOnly) await reanchorHighlights(tx, userId, rows[0].id, snapshotReading.passages);
          return {
            item: (await findOwnedItem(tx, rows[0].id, userId)).rows[0],
            duplicate: true,
          };
        }
        if (snapshot && !rows[0].source_details?.social?.post) {
          // Repair a URL-only save without losing an already generated transcript.
          const media = (await findItemMediaStage(tx, rows[0].id, userId)).rows[0];
          if (!media || media.stage !== 'complete') {
            await storeSnapshot(rows[0].id);
            if (socialPlatform) {
              await ensureSocialMediaSource(tx, rows[0].id, userId);
              await requeueImport(tx, randomUUID(), rows[0].id);
            } else {
              await completeImportForItem(tx, rows[0].id);
              await deleteMediaSource(tx, rows[0].id, userId);
              await tagBookmark(tx, rows[0].id);
            }
          } else
            await mergeCaptureDetails(tx, rows[0].id, userId, JSON.stringify(snapshot.details));
          return {
            item: (await findOwnedItem(tx, rows[0].id, userId)).rows[0],
            duplicate: true,
          };
        }
        if (rows[0].status === 'ready') return { item: rows[0], duplicate: true };
        if (captured && staged) {
          const local = staged(userId, rows[0].id);
          await local.attach(tx);
          const details = {
            ...captured.details,
            ...(local.thumbnailUrl ? { thumbnailUrl: local.thumbnailUrl } : {}),
          };
          await finishImportForItem(tx, rows[0].id);
          const repaired = await repairBrowserCapture(tx, {
            id: rows[0].id,
            title: captured.title,
            author: captured.author || null,
            excerpt: captured.excerpt || '',
            passagesJson: JSON.stringify(captured.passages),
            words: captured.words,
            bookmarkType: captured.bookmarkType ?? null,
            detailsJson: JSON.stringify(details),
            html: local.html,
            sourceName: captured.sourceName ?? null,
            publishedAt: captured.publishedAt ?? null,
          });
          await reanchorHighlights(tx, userId, rows[0].id, captured.passages);
          if (captured.bookmarkType) await tagBookmark(tx, rows[0].id);
          if (captured.tags) await addAutomaticTags(tx, rows[0].id, captured.tags);
          if (captured.raw)
            await recordSource(tx, rows[0].id, userId, captured.raw.provider, captured.raw.data);
          return { item: repaired.rows[0], duplicate: true };
        }
        return { item: rows[0], duplicate: true };
      }
    }
    const id = randomUUID();
    const reading = plainReading(input.kind === 'note' ? input.text : '');
    const { rows } = await insertCapture(tx, {
      id,
      userId,
      kind: input.kind,
      title:
        input.kind === 'note'
          ? input.title
          : cleanSourceTitle(new URL(url!).hostname, new URL(url!).hostname),
      url,
      domain: url ? new URL(url).hostname.replace(/^www\./, '') : null,
      excerpt: input.kind === 'note' ? input.text.slice(0, 300) : '',
      passagesJson: JSON.stringify(reading.passages),
      words: input.kind === 'note' ? input.text.split(/\s+/).length : 0,
      status: input.kind === 'article' ? 'pending' : 'ready',
      channel,
      turnId: originTurnId ?? null,
      html: reading.html,
    });
    if (snapshot) {
      await storeSnapshot(id);
      if (!socialPlatform) {
        await tagBookmark(tx, id);
        return {
          item: (await findOwnedItem(tx, id, userId)).rows[0],
          duplicate: false,
        };
      }
    }
    if (captured && staged) {
      const local = staged(userId, id);
      await local.attach(tx);
      const details = {
        ...captured.details,
        ...(local.thumbnailUrl ? { thumbnailUrl: local.thumbnailUrl } : {}),
      };
      const ready = await finishBrowserCapture(tx, {
        id,
        title: captured.title,
        author: captured.author || null,
        excerpt: captured.excerpt || '',
        passagesJson: JSON.stringify(captured.passages),
        words: captured.words,
        bookmarkType: captured.bookmarkType ?? null,
        detailsJson: JSON.stringify(details),
        html: local.html,
        sourceName: captured.sourceName ?? null,
        publishedAt: captured.publishedAt ?? null,
      });
      if (captured.bookmarkType) await tagBookmark(tx, id);
      if (captured.tags) await addAutomaticTags(tx, id, captured.tags);
      if (captured.raw)
        await recordSource(tx, id, userId, captured.raw.provider, captured.raw.data);
      return { item: ready.rows[0], duplicate: false };
    }
    if (socialPlatform) {
      await insertSocialMediaSource(tx, id, userId);
      await setCaptureSocialPlatform(tx, id, socialPlatform);
    }
    if (videoId) await insertYouTubeSource(tx, id, userId);
    if (url) await enqueueImport(tx, randomUUID(), id);
    return {
      item: snapshot ? (await findOwnedItem(tx, id, userId)).rows[0] : rows[0],
      duplicate: false,
    };
  });
}
/** Ownership-only checks must not load article contents or file metadata. */
export async function assertItemOwner(
  userId: string,
  id: string,
  database?: Queryable,
): Promise<void> {
  if (!z.string().uuid().safeParse(id).success)
    throw new HttpError(404, 'This item was not found.');
  const db = database || (await getDatabase());
  const { rows } = await findOwnedItemId(db, id, userId);
  if (!rows.length) throw new HttpError(404, 'This item was not found.');
}
export async function ownItem(userId: string, id: string, database?: Queryable): Promise<Item> {
  if (!z.string().uuid().safeParse(id).success)
    throw new HttpError(404, 'This item was not found.');
  const db = database || (await getDatabase());
  const { rows } = await readItemWithSource(db, id, userId);
  if (!rows[0]) throw new HttpError(404, 'This item was not found.');
  return rows[0];
}
