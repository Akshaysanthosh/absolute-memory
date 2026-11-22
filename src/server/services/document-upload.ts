import { after } from 'next/server';
import { getConfig } from '@/server/config';
import { getDatabase, type Database } from '@/server/db';
import { afterInlineWork } from '@/server/jobs/inline';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { logEvent } from '@/server/logging/events';
import { findDocumentByDigest } from '@/server/repos/documents';
import { documentDigest } from '@/server/services/document-assets';
import { extractDocument, fileType, saveDocument } from '@/server/services/documents';
import { analyzeSavedImage } from '@/server/services/image-analysis';
import { saveMediaUpload } from '@/server/services/media/upload';

type DocumentUpload = {
  name: string;
  data: Uint8Array;
  media: boolean;
  careful: boolean;
  signal: AbortSignal;
};

export async function saveUpload(upload: DocumentUpload, userId: string, database?: Database) {
  const db = database ?? (await getDatabase());
  const { name, data, media } = upload;
  if (media)
    return { ...(await saveMediaUpload(userId, name, data, db)), status: 'pending' as const };
  const mime = fileType(data, name);
  if (mime.startsWith('image/')) {
    const id = await saveDocument(
      userId,
      name,
      data,
      { passages: [], html: '', pages: 1, mime, method: 'original image' },
      db,
    );
    after(async () => {
      try {
        await analyzeSavedImage(userId, id, AbortSignal.timeout(80_000), db);
      } catch (error) {
        logEvent('warn', 'image.analysis_deferred', error);
      }
      if (getConfig().ROLE === 'all') await runKnowledgeBatch(userId);
    });
    return { id, duplicate: false, status: 'ready' as const };
  }
  const parsed = await extractDocument(
    data,
    name,
    upload.careful,
    userId,
    AbortSignal.any([upload.signal, AbortSignal.timeout(110_000)]),
    db,
  );
  const id = await saveDocument(userId, name, data, parsed, db);
  afterInlineWork(() => runKnowledgeBatch(userId));
  return { id, duplicate: false, status: 'ready' as const };
}

export async function saveOrReuseUpload(upload: DocumentUpload, userId: string) {
  const db = await getDatabase();
  const existing = upload.media
    ? undefined
    : (await findDocumentByDigest(db, userId, documentDigest(upload.data))).rows[0];
  return existing ? { ...existing, duplicate: true } : saveUpload(upload, userId, db);
}
