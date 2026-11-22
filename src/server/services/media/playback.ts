import { HttpError } from '@/server/auth/http';
import { safeFetch } from '@/server/security/safe-fetch';
import { mediaDownloadLimit } from './tools';

const audioTypes = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
  'application/ogg',
]);

export async function podcastAudio(url: string, range: string | null, requestSignal: AbortSignal) {
  if (range && !/^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/.test(range)) {
    throw new HttpError(416, 'Unsupported audio range.');
  }

  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(180_000)]);
  const { readable, writable } = new TransformStream<Uint8Array<ArrayBuffer>>();
  const writer = writable.getWriter();
  const response = Promise.withResolvers<{
    body: ReadableStream<Uint8Array<ArrayBuffer>>;
    status: number;
    headers: Headers;
  }>();
  const abort = () => {
    void writer.abort(signal.reason).catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  void safeFetch(
    url,
    {
      headers: { ...(range ? { Range: range } : {}), 'Accept-Encoding': 'identity' },
      timeoutMs: 180_000,
      maxBytes: mediaDownloadLimit,
      signal,
    },
    async (upstream, _url, body) => {
      if (upstream.status === 416) throw new HttpError(416, 'Audio range is unavailable.');
      const type = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      const size = upstream.headers.get('content-length');
      const encoding = upstream.headers.get('content-encoding');
      if (
        ![200, 206].includes(upstream.status) ||
        !type ||
        !audioTypes.has(type) ||
        (encoding && encoding !== 'identity') ||
        (size && Number(size) > mediaDownloadLimit)
      ) {
        throw new HttpError(502, 'The podcast audio is unavailable.');
      }

      const headers = new Headers({
        'Content-Type': type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      const returnedRange = upstream.headers.get('content-range');
      if (upstream.status === 206) {
        if (!returnedRange || !/^bytes \d+-\d+\/\d+$/.test(returnedRange)) {
          throw new HttpError(502, 'The podcast returned an invalid audio range.');
        }
        headers.set('Content-Range', returnedRange);
      }
      if (upstream.status === 206 || upstream.headers.get('accept-ranges') === 'bytes') {
        headers.set('Accept-Ranges', 'bytes');
      }
      if (size && /^\d+$/.test(size)) headers.set('Content-Length', size);
      response.resolve({ body: readable, status: upstream.status, headers });
      for await (const chunk of body) await writer.write(new Uint8Array(chunk));
      await writer.close();
    },
  )
    .catch((error) => {
      response.reject(
        error instanceof HttpError
          ? error
          : new HttpError(502, 'The podcast audio is unavailable.'),
      );
      return writer.abort(error).catch(() => {});
    })
    .finally(() => signal.removeEventListener('abort', abort));
  return response.promise;
}
