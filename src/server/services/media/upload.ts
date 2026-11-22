import { lockUser } from '@/server/repos/users';
import { findMediaFingerprint, insertUploadedMediaSource } from '@/server/repos/media-sources';
import { insertUploadedMediaItem } from '@/server/repos/media-items';
import { enqueueImport } from '@/server/repos/import-jobs';
import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '@/server/auth/http';
import type { Database } from '@/server/db';
import { getStorage } from '@/server/providers';
import { forgetStagedObject, trackStagedObject } from '@/server/repos/documents';
import { maximumUploadBytes } from '@/server/config';
import { canTranscribe } from '@/server/services/media/audio';

export async function saveMediaUpload(
  userId: string,
  name: string,
  data: Uint8Array,
  db: Database,
) {
  if (!canTranscribe())
    throw new HttpError(
      409,
      'Configure a transcription provider and ffmpeg to upload audio or video.',
    );
  if (!data.length || data.length > maximumUploadBytes())
    throw new HttpError(413, 'This audio or video exceeds the upload limit.');
  const id = randomUUID();
  const owner = createHash('sha256').update(userId).digest('hex');
  const fingerprint = 'audio:' + createHash('sha256').update(data).digest('hex');
  const key = `media/${owner}/${id}/upload`;
  const title =
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .trim()
      .slice(0, 300) || 'Uploaded media';
  await trackStagedObject(db, key);
  await getStorage().put(key, data, 'application/octet-stream');
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = (await findMediaFingerprint(tx, userId, fingerprint)).rows[0];
    if (existing) return { id: existing.item_id, duplicate: true };
    await insertUploadedMediaItem(tx, id, userId, title);
    await insertUploadedMediaSource(tx, id, userId, fingerprint, key);
    await enqueueImport(tx, randomUUID(), id);
    await forgetStagedObject(tx, key);
    return { id, duplicate: false };
  });
}
