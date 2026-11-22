import { HttpError } from '@/server/auth/http';
import { maximumUploadBytes } from '@/server/config';
import { documentFileLimitMessage } from '@/server/services/documents';
import { isMediaFilename } from '@/shared/media/upload';

export async function readUpload(req: Request) {
  let name = 'Document';
  try {
    name = decodeURIComponent(req.headers.get('x-file-name') || name).slice(0, 255);
  } catch {
    /* Keep the default. */
  }
  const media = isMediaFilename(name);
  const limit = maximumUploadBytes();
  const message = media
    ? 'This audio or video exceeds the upload limit.'
    : documentFileLimitMessage(limit);
  if (Number(req.headers.get('content-length') ?? 0) > limit) throw new HttpError(413, message);
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'Choose a file first.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, message);
    }
    chunks.push(part.value);
  }
  if (!size) throw new HttpError(400, 'This file is empty.');
  return {
    name,
    data: new Uint8Array(Buffer.concat(chunks)),
    media,
    careful: req.headers.get('x-careful-read') === 'true',
    signal: req.signal,
  };
}
