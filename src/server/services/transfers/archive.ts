import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open as openFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fromBuffer, open, type Entry, type ZipFile } from 'yauzl';
import { ZipFile as ZipWriter } from 'yazl';
import { HttpError } from '@/server/auth/http';
import { limitedTransferStream, transferLimits } from './limits';

export type TransferSource = string | Uint8Array;

export async function bufferReadable(stream: AsyncIterable<Uint8Array>, maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new HttpError(413, 'This archive exceeds the size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function temporaryDirectory<T>(work: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), 'absolute-memory-transfer-'));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function withTransferFile<T>(source: Readable, useFile: (file: string) => Promise<T>) {
  return temporaryDirectory(async (directory) => {
    const file = join(directory, 'upload');
    const signal = AbortSignal.timeout(8 * 60_000);
    await pipeline(
      limitedTransferStream(source, transferLimits().uploadBytes, signal),
      createWriteStream(file, { flags: 'wx', mode: 0o600 }),
      { signal },
    );
    return useFile(file);
  });
}

async function openArchive(input: TransferSource) {
  const limit = transferLimits().uploadBytes;
  const size = typeof input === 'string' ? (await stat(input)).size : input.byteLength;
  if (size > limit) throw new HttpError(413, 'This archive exceeds the configured upload limit.');
  const options = {
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true,
    autoClose: false,
  };
  return new Promise<ZipFile>((resolve, reject) => {
    const done = (error: Error | null, zip: ZipFile) => {
      if (error) reject(new HttpError(422, 'This file is not a readable ZIP archive.'));
      else resolve(zip);
    };
    if (typeof input === 'string') open(input, options, done);
    else fromBuffer(Buffer.isBuffer(input) ? input : Buffer.from(input), options, done);
  });
}

export async function isZip(input: TransferSource) {
  if (typeof input !== 'string') return input[0] === 80 && input[1] === 75;
  const file = await openFile(input, 'r');
  try {
    const header = Buffer.alloc(2);
    await file.read(header, 0, 2, 0);
    return header[0] === 80 && header[1] === 75;
  } finally {
    await file.close();
  }
}

export async function readPlainTransfer(input: TransferSource) {
  const maxBytes = Math.min(transferLimits().uploadBytes, transferLimits().metadataBytes);
  if (typeof input === 'string') return bufferReadable(createReadStream(input), maxBytes);
  if (input.byteLength > maxBytes)
    throw new HttpError(413, 'This transfer exceeds the configured metadata limit.');
  return Buffer.isBuffer(input) ? input : Buffer.from(input);
}

export type ArchiveFiles = {
  entries: ReadonlyMap<string, string>;
  read(name: string): Promise<Buffer | undefined>;
};

function entryStream(zip: ZipFile, entry: Entry) {
  return new Promise<Readable>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) =>
      error ? reject(error) : resolve(stream as Readable),
    );
  });
}

export function withUnpackedArchive<T>(
  input: TransferSource,
  include: (name: string) => boolean,
  consume: (files: ArchiveFiles) => Promise<T>,
  isMetadata: (name: string) => boolean = () => true,
) {
  return temporaryDirectory(async (directory) => {
    const limits = transferLimits();
    const zip = await openArchive(input);
    const files = new Map<string, string>();
    const seen = new Set<string>();
    let expanded = 0;
    let metadata = 0;
    if (zip.entryCount > limits.entryCount) {
      zip.close();
      throw new HttpError(413, 'The archive contains too many entries.');
    }
    async function unpack(entry: Entry) {
      const name = entry.fileName;
      expanded += entry.uncompressedSize;
      if (
        expanded > limits.expandedBytes ||
        entry.uncompressedSize > limits.entryBytes ||
        seen.has(name)
      ) {
        throw new HttpError(413, 'The archive contains oversized or duplicate entries.');
      }
      seen.add(name);
      if (!include(name) || name.endsWith('/')) return;
      if (isMetadata(name)) {
        metadata += entry.uncompressedSize;
        if (metadata > limits.metadataBytes)
          throw new HttpError(413, 'The archive metadata exceeds the configured limit.');
      }
      const output = join(directory, String(files.size));
      const source = await entryStream(zip, entry);
      // With size validation enabled, the output stream checks each entry's declared size.
      await pipeline(source, createWriteStream(output, { flags: 'wx', mode: 0o600 }));
      files.set(name, output);
    }
    try {
      await new Promise<void>((resolve, reject) => {
        zip.once('error', reject);
        zip.once('end', resolve);
        zip.on('entry', (entry: Entry) => {
          void unpack(entry).then(() => zip.readEntry(), reject);
        });
        zip.readEntry();
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(422, 'The ZIP archive contains an invalid entry.');
    } finally {
      zip.close();
    }
    return consume({
      entries: files,
      async read(name) {
        const path = files.get(name);
        return path ? readFile(path) : undefined;
      },
    });
  });
}

export function zipFiles(files: Iterable<readonly [string, Uint8Array]>) {
  const zip = new ZipWriter();
  const output = zip.outputStream as Readable;
  zip.on('error', (error) => output.destroy(error));
  for (const [name, content] of files)
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  zip.end();
  return output;
}
