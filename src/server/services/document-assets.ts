import { createHash, randomUUID } from 'node:crypto';
import { getDatabase, type Database, type Queryable } from '@/server/db';
import { HttpError, resourceId } from '@/server/auth/http';
import { getStorage, readStorageBytes, type StorageProvider } from '@/server/providers';
import {
  claimUnusedObjects,
  findDocument,
  findVerifiedThumbnailAsset,
  upsertThumbnailAsset,
  forgetStagedObject,
  insertDocument,
  objectIsReferenced,
  trackStagedObject,
  type DocumentSource,
} from '@/server/repos/documents';

export const documentDigest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function documentKey(userId: string, itemId: string, variant: string, digest: string) {
  const owner = createHash('sha256').update(userId).digest('hex');
  return `documents/${owner}/${resourceId(itemId)}/${variant}/${digest}-${randomUUID()}`;
}

export async function readDocument(
  userId: string,
  itemId: string,
  db?: Queryable,
  storage = getStorage(),
) {
  const file = await findDocument(userId, resourceId(itemId), db ?? (await getDatabase()));
  if (!file) throw new HttpError(404, 'Original file not found.');
  const data = await readStorageBytes(storage, file.object_key, file.size);
  if (data.length !== file.size || documentDigest(data) !== file.digest) {
    throw new HttpError(503, 'The stored file could not be verified.');
  }
  return { ...file, data };
}

type Original = Pick<DocumentSource, 'name' | 'mime' | 'pages' | 'method'> & { data: Uint8Array };

/** Register cleanup before transfer so an interrupted process leaves a recoverable object. */
export async function storeOriginal(
  db: Database,
  userId: string,
  itemId: string,
  input: Original,
  storage = getStorage(),
) {
  const digest = documentDigest(input.data);
  const key = documentKey(userId, itemId, 'original', digest);
  const size = input.data.byteLength;
  await trackStagedObject(db, key);
  await storage.put(key, input.data, input.mime);
  return async (tx: Queryable) => {
    await insertDocument(
      userId,
      itemId,
      {
        name: input.name.slice(0, 255),
        mime: input.mime,
        pages: input.pages,
        method: input.method,
        size,
        digest,
        object_key: key,
      },
      tx,
    );
    await forgetStagedObject(tx, key);
  };
}

export async function maintainDocumentAssets(
  db: Database,
  storage = getStorage(),
  maxMilliseconds = 60_000,
) {
  const deadline = Date.now() + maxMilliseconds;
  let deleted = 0;
  let failed = 0;
  for (const key of await claimUnusedObjects(db)) {
    if (Date.now() >= deadline) break;
    try {
      if (!(await objectIsReferenced(db, key))) {
        await storage.delete(key);
        deleted += 1;
      }
      await forgetStagedObject(db, key);
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}

export async function readStoredThumbnail(
  userId: string,
  itemId: string,
  digest: string,
  db: Queryable,
  storage: StorageProvider,
) {
  const {
    rows: [asset],
  } = await findVerifiedThumbnailAsset(db, itemId, userId, digest);
  if (!asset) return null;
  try {
    const bytes = await readStorageBytes(storage, asset.object_key, asset.size);
    return bytes.length === asset.size && documentDigest(bytes) === asset.content_digest
      ? new Uint8Array(bytes)
      : null;
  } catch {
    return null;
  }
}

export async function storeThumbnail(
  userId: string,
  itemId: string,
  digest: string,
  bytes: Uint8Array,
  db: Database,
  storage: StorageProvider,
) {
  const key = documentKey(userId, itemId, 'thumbnail-v1', digest);
  const checksum = documentDigest(bytes);
  const mime = thumbnailMime(bytes);
  await trackStagedObject(db, key);
  await storage.put(key, bytes, mime);
  await db.transaction(async (tx) => {
    const { rows } = await upsertThumbnailAsset(
      tx,
      itemId,
      userId,
      digest,
      key,
      bytes.length,
      mime,
      checksum,
    );
    if (rows.length) await forgetStagedObject(tx, key);
  });
}

export function thumbnailMime(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
    ? 'image/webp'
    : 'image/png';
}
