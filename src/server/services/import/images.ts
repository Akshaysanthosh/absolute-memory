import { randomUUID } from 'node:crypto';
import { getConfig } from '@/server/config';
import { getDatabase, type Database, type Queryable } from '@/server/db';
import { getStorage, readStorageBytes } from '@/server/providers';
import { forgetStagedObject, trackStagedObject } from '@/server/repos/documents';
import {
  findReadingImage,
  replaceReadingImages,
  type ReadingImage,
} from '@/server/repos/reading-images';
import { collectBytes, safeFetch } from '@/server/security/safe-fetch';
import { imageMime } from '@/shared/image-file';
import { finishImages } from './content';

const maxImageBytes = 2 * 1024 * 1024;
const maxImages = 12;

async function download(source: string) {
  return safeFetch(
    source,
    {
      maxBytes: maxImageBytes,
      timeoutMs: 8_000,
      accept: 'image/png,image/jpeg,image/webp',
    },
    async (response, _url, stream) => {
      if (!response.ok) return null;
      const bytes = await collectBytes(stream);
      const mime = imageMime(bytes);
      return mime ? { bytes, mime } : null;
    },
  );
}

export async function prepareReadingImages(
  db: Queryable,
  html: string,
  sources: { slot: number; source: string }[],
  lead?: string | null,
) {
  const stored: ReadingImage[] = [];

  const leadSlot = sources.find((image) => image.source === lead)?.slot ?? sources.length;
  const candidates = new Map(
    sources.slice(0, maxImages).map((image) => [image.slot, image.source]),
  );
  if (lead) candidates.set(leadSlot, lead);

  if (getConfig().ALLOW_REMOTE_IMAGES) {
    const storage = getStorage();
    const entries = [...candidates];
    for (let start = 0; start < entries.length; start += 3) {
      await Promise.all(
        entries.slice(start, start + 3).map(async ([slot, source]) => {
          const image = await download(source).catch(() => null);
          if (!image) return;
          const key = `reading-images/${randomUUID()}`;
          await trackStagedObject(db, key);
          try {
            await storage.put(key, image.bytes, image.mime);
          } catch {
            return;
          }

          stored.push({ slot, object_key: key, mime: image.mime, size: image.bytes.length });
        }),
      );
    }
  }

  return (userId: string, itemId: string) => {
    const urls = new Map(
      stored.map(({ slot }) => [slot, `/api/items/${itemId}/reading-images/${slot}`]),
    );
    return {
      html: finishImages(html, urls),
      thumbnailUrl: lead ? urls.get(leadSlot) : undefined,
      async attach(tx: Queryable) {
        await replaceReadingImages(tx, userId, itemId, stored);
        for (const image of stored) await forgetStagedObject(tx, image.object_key);
      },
    };
  };
}

export async function stageReadingImages(
  db: Database,
  userId: string,
  itemId: string,
  html: string,
  sources: { slot: number; source: string }[],
  lead?: string | null,
) {
  return (await prepareReadingImages(db, html, sources, lead))(userId, itemId);
}

export async function readArticleImage(
  userId: string,
  itemId: string,
  slot: number,
  database?: Queryable,
) {
  const image = await findReadingImage(database ?? (await getDatabase()), userId, itemId, slot);
  if (!image) return null;
  const bytes = await readStorageBytes(getStorage(), image.object_key, image.size);
  return bytes.length === image.size && imageMime(bytes) === image.mime
    ? { bytes, mime: image.mime }
    : null;
}
