import { randomUUID } from 'node:crypto';
import { HttpError } from '@/server/auth/http';
import type { Queryable } from '@/server/db';
import { getStorage } from '@/server/providers';
import { forgetStagedObject, trackStagedObject } from '@/server/repos/documents';
import { replaceReadingImages, type ReadingImage } from '@/server/repos/reading-images';
import { finishImages, prepareContent } from '@/server/services/import/content';
import { imageMime } from '@/shared/image-file';
import type { Passage } from '@/shared/passages';
import type { ArchiveFiles } from './archive';
import { readingImagePath, type PortableImage } from './format';

const archiveOrigin = 'https://archive.invalid';

export async function restoreReading(
  db: Queryable,
  archive: ArchiveFiles,
  item: { id: string; reading_html: string; passages: Passage[]; reading_images: PortableImage[] },
  defaultBase?: string | null,
) {
  const clean = prepareContent(item.reading_html, defaultBase || archiveOrigin);
  const passages = clean.passages.map((passage) => {
    const previous = item.passages[passage.index];
    return previous?.index === passage.index &&
      previous.text === passage.text &&
      previous.startMs !== undefined
      ? { ...passage, startMs: previous.startMs, endMs: previous.endMs }
      : passage;
  });

  const files = new Map<number, ReadingImage>();
  for (const image of item.reading_images) {
    const bytes = await archive.read(readingImagePath(item.id, image));
    if (
      !bytes ||
      files.has(image.slot) ||
      bytes.length !== image.size ||
      imageMime(bytes) !== image.mime
    ) {
      throw new HttpError(422, 'A reading image does not match its archive entry.');
    }
    const object_key = `reading-images/${randomUUID()}`;
    await trackStagedObject(db, object_key);
    await getStorage().put(object_key, bytes, image.mime);
    files.set(image.slot, { ...image, object_key });
  }

  const archivePrefix = `/api/items/${item.id}/reading-images/`;
  const origin = new URL(defaultBase || archiveOrigin).origin;
  function archivedSlot(source: string) {
    const url = new URL(source, origin);
    if (url.origin !== origin || url.search || url.hash || !url.pathname.startsWith(archivePrefix))
      return undefined;
    const segment = url.pathname.slice(archivePrefix.length);
    const slot = Number(segment);
    return /^\d+$/.test(segment) && files.has(slot) ? slot : undefined;
  }
  const positions = clean.images.flatMap((image) => {
    const slot = archivedSlot(image.source);
    return slot === undefined ? [] : [{ position: image.slot, slot }];
  });

  return {
    passages,
    forItem(id: string, thumbnail: unknown) {
      const path = (slot: number) => `/api/items/${id}/reading-images/${slot}`;
      const thumbnailSlot =
        typeof thumbnail === 'string' && thumbnail.startsWith(archivePrefix)
          ? archivedSlot(thumbnail)
          : undefined;
      return {
        html: finishImages(
          clean.html,
          new Map(positions.map((image) => [image.position, path(image.slot)])),
        ),
        thumbnailUrl: thumbnailSlot === undefined ? undefined : path(thumbnailSlot),
        async attach(tx: Queryable, userId: string) {
          await replaceReadingImages(tx, userId, id, [...files.values()]);
          for (const key of files.values()) await forgetStagedObject(tx, key.object_key);
        },
      };
    },
  };
}
