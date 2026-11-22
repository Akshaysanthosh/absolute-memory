import { getDocumentProxy, renderPageAsImage } from 'unpdf';
import { HttpError } from '@/server/auth/http';
import { getDatabase } from '@/server/db';
import { readDocument } from '@/server/services/document-assets';
import { extractDocument, saveDocument } from '@/server/services/documents';

export async function readDocumentPage(userId: string, id: string, page: number) {
  const file = await readDocument(userId, id);
  if (!Number.isInteger(page) || page < 1 || page > file.pages)
    throw new HttpError(400, 'Choose a page in this document.');
  if (file.mime !== 'application/pdf') return { data: new Uint8Array(file.data), mime: file.mime };

  const pdf = await getDocumentProxy(new Uint8Array(file.data), { maxImageSize: 16777216 });
  try {
    const viewport = (await pdf.getPage(page)).getViewport({ scale: 1 });
    const scale = Math.min(1.5, 1200 / Math.max(viewport.width, viewport.height));
    const image = await renderPageAsImage(pdf, page, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale,
    });
    return { data: image as ArrayBuffer, mime: 'image/png' };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export async function saveCarefulVersion(userId: string, id: string, signal: AbortSignal) {
  const db = await getDatabase();
  const file = await readDocument(userId, id, db);
  const data = new Uint8Array(file.data),
    parsed = await extractDocument(data, file.name, true, userId, signal, db);
  const newId = await saveDocument(
    userId,
    file.name.replace(/\.[^.]+$/, '') +
      ' — careful read' +
      (file.mime === 'application/pdf' ? '.pdf' : '.png'),
    data,
    parsed,
    db,
  );
  return newId;
}
