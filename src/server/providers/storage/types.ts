import type { Readable } from 'node:stream';

export interface StorageProvider {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  putStream(
    key: string,
    source: Readable,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function objectKey(key: string): string {
  if (!/^(?:[a-z0-9][a-z0-9-]{0,79}\/){1,6}[a-z0-9][a-z0-9.-]{0,159}$/.test(key)) {
    throw new Error('Invalid storage key.');
  }
  return key;
}

export async function readStorageBytes(storage: StorageProvider, key: string, maxBytes: number) {
  const body = await storage.get(key);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > maxBytes) throw new Error('Stored file exceeds its recorded size.');
      chunks.push(bytes);
    }
  } finally {
    body.destroy();
  }
  return Buffer.concat(chunks);
}
