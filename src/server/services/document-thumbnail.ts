import { findThumbnailSource } from '@/server/repos/documents';
import { getDocumentProxy, renderPageAsImage } from 'unpdf';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { getDatabase, type Database } from '@/server/db';
import { HttpError } from '@/server/auth/http';
import {
  readDocument,
  readStoredThumbnail,
  storeThumbnail,
} from '@/server/services/document-assets';
import { getStorage, type StorageProvider } from '@/server/providers';

const maxEntries = 32;
const maxDimension = 560;

async function render(data: Uint8Array, mime: string) {
  if (mime === 'application/pdf') {
    const pdf = await getDocumentProxy(data.slice(), { maxImageSize: 4_000_000 });
    try {
      const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
      const largest = Math.max(viewport.width, viewport.height);
      if (!Number.isFinite(largest) || largest <= 0)
        throw new HttpError(422, 'Document preview is unavailable.');
      const image = await renderPageAsImage(pdf, 1, {
        canvasImport: () => import('@napi-rs/canvas'),
        scale: Math.min(1, maxDimension / largest),
      });
      return new Uint8Array(image as ArrayBuffer);
    } finally {
      await pdf.loadingTask.destroy();
    }
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime))
    throw new HttpError(422, 'Document preview is unavailable.');
  const image = await loadImage(Buffer.from(data));
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = createCanvas(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  );
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  // Photos as PNG were ~300 KB per card; WebP keeps them around a tenth of that.
  return new Uint8Array(await canvas.encode('webp', 82));
}

export function createDocumentThumbnail() {
  const cache = new Map<string, Uint8Array>();
  const inFlight = new Map<string, Promise<Uint8Array>>();
  return async function documentThumbnail(
    userId: string,
    itemId: string,
    database?: Database,
    ifNoneMatch?: string | null,
    store: StorageProvider = getStorage(),
  ) {
    const db = database ?? (await getDatabase());
    // Always recheck ownership/existence before consulting the bounded, tenant-keyed cache.
    const { rows } = await findThumbnailSource(db, itemId, userId);
    const source = rows[0];
    if (!source) throw new HttpError(404, 'Original file not found.');
    // Use the stored fingerprint: authorization/cache checks never read original bytes.
    const digest = source.digest;
    const etag = `"${digest}"`;
    // Conditional responses still check ownership, but need neither source transfer nor rendering.
    if (ifNoneMatch === etag) return { bytes: new Uint8Array(), etag };
    const key = `${userId}:${itemId}:${digest}`;
    let bytes = cache.get(key);
    if (bytes) {
      cache.delete(key);
      cache.set(key, bytes);
    } else {
      let pending = inFlight.get(key);
      if (!pending) {
        if (inFlight.size >= 8) throw new HttpError(429, 'Previews are busy. Please try again.');
        pending = (async () => {
          const stored = await readStoredThumbnail(userId, itemId, digest, db, store);
          if (stored) return stored;
          const file = await readDocument(userId, itemId, db, store);
          if (file.digest !== digest)
            throw new HttpError(409, 'This file changed. Please open it again.');
          const result = await render(new Uint8Array(file.data), source.mime);
          try {
            await storeThumbnail(userId, itemId, digest, result, db, store);
          } catch {
            /* Preview remains usable if persistent caching is unavailable. */
          }
          return result;
        })();
        inFlight.set(key, pending);
      }
      try {
        bytes = await pending;
        cache.set(key, bytes);
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
      } finally {
        inFlight.delete(key);
      }
    }
    return { bytes, etag: `"${digest}"` };
  };
}
export const documentThumbnail = createDocumentThumbnail();
