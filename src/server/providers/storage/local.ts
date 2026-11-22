import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { objectKey, type StorageProvider } from './types';

function missing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class LocalStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  private path(key: string) {
    return join(this.root, objectKey(key));
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.putStream(key, Readable.from([bytes]), contentType);
  }

  async putStream(key: string, source: Readable, _contentType: string, signal?: AbortSignal) {
    const target = this.path(key);
    const temporary = target + '.' + randomUUID() + '.tmp';
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    try {
      await pipeline(source, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), {
        signal,
      });
      await rename(temporary, target);
    } finally {
      try {
        await unlink(temporary);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
  }

  async get(key: string) {
    return (await open(this.path(key), 'r')).createReadStream();
  }

  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }

  async exists(key: string) {
    try {
      return (await stat(this.path(key))).isFile();
    } catch (error) {
      if (missing(error)) return false;
      throw error;
    }
  }
}
