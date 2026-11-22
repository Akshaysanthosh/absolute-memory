import { Readable } from 'node:stream';
import { exportFilename } from '@/server/services/transfers/format';

export function zipDownload(stream: Readable) {
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${exportFilename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
