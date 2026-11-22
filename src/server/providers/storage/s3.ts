import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { addAbortSignal, Readable } from 'node:stream';
import { objectKey, type StorageProvider } from './types';

export class S3Storage implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: S3ClientConfig,
  ) {
    this.client = new S3Client({ ...options, maxAttempts: 2 });
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(key),
        Body: bytes,
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
  }

  async putStream(key: string, source: Readable, contentType: string, signal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) signal.throwIfAborted();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: objectKey(key),
          Body: addAbortSignal(controller.signal, source),
          ContentType: contentType,
        },
        queueSize: 2,
        partSize: 5 * 1024 * 1024,
        abortController: controller,
      }).done();
    } finally {
      signal?.removeEventListener('abort', abort);
      source.destroy();
    }
  }

  async get(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(key),
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
    if (!(response.Body instanceof Readable))
      throw new Error('Object storage returned an unreadable file.');
    return response.Body;
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(key),
      }),
      { abortSignal: AbortSignal.timeout(20_000) },
    );
  }

  async exists(key: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey(key),
        }),
        { abortSignal: AbortSignal.timeout(20_000) },
      );
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        '$metadata' in error &&
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
      )
        return false;
      throw error;
    }
  }
}
