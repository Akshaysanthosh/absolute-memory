import { addAbortSignal, Readable } from 'node:stream';
import { HttpError } from '@/server/auth/http';
import { getConfig } from '@/server/config';

const mib = 1024 * 1024;

export function transferLimits() {
  const config = getConfig();
  return {
    uploadBytes: config.TRANSFER_MAX_UPLOAD_MB * mib,
    expandedBytes: config.TRANSFER_MAX_EXPANDED_MB * mib,
    entryBytes: config.TRANSFER_MAX_ENTRY_MB * mib,
    entryCount: config.TRANSFER_MAX_ENTRIES,
    metadataBytes: config.TRANSFER_MAX_METADATA_MB * mib,
  };
}

export function limitedTransferStream(source: Readable, maxBytes: number, signal: AbortSignal) {
  addAbortSignal(signal, source);
  return Readable.from(
    (async function* () {
      let size = 0;
      try {
        for await (const chunk of source) {
          size += chunk.byteLength;
          if (size > maxBytes)
            throw new HttpError(413, 'This transfer exceeds the configured size limit.');
          yield chunk;
        }
        if (!size) throw new HttpError(400, 'Choose a nonempty import file.');
      } finally {
        source.destroy();
      }
    })(),
    { objectMode: false },
  );
}
