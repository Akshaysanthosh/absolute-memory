import {
  readTransferSnapshot,
  type Item,
  type File,
  type Thread,
  type Message,
} from '@/server/repos/transfer-snapshot';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import { getDatabase, type Database } from '@/server/db';
import { getStorage, type StorageProvider } from '@/server/providers';
import type { StoredHighlight } from '@/server/repos/reading';
import { passagesToNoteDocument } from '@/shared/note-document';
import { exportFormat, exportVersion, mimeExtensions, readingImagePath } from './format';
import packageInfo from '../../../../package.json';

type Highlight = Pick<StoredHighlight, 'quote' | 'segments'>;

function group<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const name = key(row);
    const values = groups.get(name) ?? [];
    values.push(row);
    groups.set(name, values);
  }
  return groups;
}

function jsonl(rows: unknown[]) {
  return Readable.from(
    (function* () {
      for (const row of rows) yield Buffer.from(JSON.stringify(row) + '\n');
    })(),
    { objectMode: false },
  );
}

async function verifiedOriginal(storage: StorageProvider, file: File) {
  const source = await storage.get(file.object_key);
  return Readable.from(
    (async function* () {
      const hash = createHash('sha256');
      let bytes = 0;
      try {
        for await (const chunk of source) {
          bytes += chunk.byteLength;
          if (bytes > file.size) throw new Error('An original file exceeds its recorded size.');
          hash.update(chunk);
          yield chunk;
        }
        if (bytes !== file.size || hash.digest('hex') !== file.digest)
          throw new Error('An original file could not be verified.');
      } finally {
        source.destroy();
      }
    })(),
    { objectMode: false },
  );
}

function yaml(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function markdownFor(item: Item, tags: string[], highlights: Highlight[]) {
  const header = [
    '---',
    `id: ${yaml(item.id)}`,
    `title: ${yaml(item.title)}`,
    `source: ${yaml(item.url)}`,
    `saved: ${yaml(item.created_at)}`,
    `tags: ${yaml(tags)}`,
    '---',
    '',
    `# ${item.title.replace(/[\r\n]/g, ' ')}`,
  ];
  const byPassage = new Map<number, Highlight[]>();
  const unanchored: Highlight[] = [];
  for (const highlight of highlights) {
    const index = highlight.segments[0]?.passageIndex;
    if (index === undefined) unanchored.push(highlight);
    else {
      const rows = byPassage.get(index) ?? [];
      rows.push(highlight);
      byPassage.set(index, rows);
    }
  }
  const quote = (highlight: Highlight) => '> ' + highlight.quote.replace(/\r?\n/g, '\n> ');
  for (const passage of item.passages) {
    header.push('', passage.text);
    for (const highlight of byPassage.get(passage.index) ?? []) header.push('', quote(highlight));
  }
  for (const highlight of unanchored) header.push('', quote(highlight));
  return header.join('\n') + '\n';
}

function makeChats(threads: Thread[], messages: Message[]) {
  const byThread = group(messages, (message) => message.thread_id);
  return threads.map((thread) => ({
    ...thread,
    messages: (byThread.get(thread.id) ?? []).sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)),
    ),
  }));
}

export async function exportLibrary(userId: string, db?: Database) {
  const snapshot = await (db ?? (await getDatabase())).transaction((tx) =>
    readTransferSnapshot(tx, userId),
  );
  const storage = getStorage();
  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  zip.on('error', (error) => output.destroy(error));
  const tags = group(snapshot.tags, (row) => row.item_id);
  const marks = group(snapshot.highlights, (row) => row.itemId);
  const images = group(snapshot.images, (row) => row.item_id);
  const media = new Map(snapshot.media.map((row) => [row.item_id, row]));
  const raw = new Map(snapshot.raw.map((row) => [row.item_id, row]));
  const summaries = new Map(snapshot.summaries.map((row) => [row.item_id, row.summary]));
  const files = new Map(snapshot.files.map((row) => [row.item_id, row]));
  const markdown = new Map<string, string>();
  const paths = new Map<string, File>();
  const items = snapshot.items.map(({ user_id, ...item }) => {
    const names = (tags.get(item.id) ?? []).map((tag) => tag.name);
    markdown.set(item.id, markdownFor(item, names, marks.get(item.id) ?? []));
    const source = files.get(item.id);
    let file = null;
    if (source) {
      const { item_id, object_key, ...metadata } = source;
      const extension = mimeExtensions[metadata.mime];
      if (!extension) throw new Error('The library contains an unsupported original file type.');
      file = { ...metadata, path: `files/${metadata.digest}.${extension}` };
      paths.set(file.path, source);
    }
    const reading_images = (images.get(item.id) ?? []).map(({ slot, size, mime }) => ({
      slot,
      size,
      mime,
    }));
    return {
      ...item,
      reading_images,
      tags: names,
      topics: names,
      file,
      media: media.get(item.id),
      raw: raw.get(item.id),
      summary: summaries.get(item.id),
    };
  });
  const itemNotes = new Set(snapshot.notes.map((note) => note.item_id));
  const notes: Record<string, unknown>[] = snapshot.notes.map((note) => ({
    ...note,
    markdown: markdown.get(String(note.item_id)) ?? '',
  }));
  for (const item of snapshot.items) {
    if (item.kind !== 'note' || itemNotes.has(item.id)) continue;
    notes.push({
      item_id: item.id,
      document: passagesToNoteDocument(item.passages),
      version: 1,
      updated_at: item.updated_at,
      markdown: markdown.get(item.id) ?? '',
    });
  }
  const chats = makeChats(snapshot.libraryThreads, snapshot.libraryMessages);
  const highlights = snapshot.highlights.map(({ id, itemId, quote, segments, createdAt }) => ({
    id,
    item_id: itemId,
    quote,
    segments,
    created_at: createdAt,
  }));
  const lists = { items, highlights, notes, chats };
  const counts = Object.fromEntries(
    Object.entries(lists).map(([name, data]) => [name, data.length]),
  );
  const manifest = {
    format: exportFormat,
    version: exportVersion,
    exported_at: new Date().toISOString(),
    app_version: packageInfo.version,
    counts: { ...counts, files: paths.size, reading_images: snapshot.images.length },
  };
  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), 'manifest.json');
  for (const [name, data] of Object.entries(lists)) {
    zip.addReadStreamLazy(`${name}.jsonl`, {}, (callback) => callback(null, jsonl(data)));
  }
  zip.addBuffer(
    Buffer.from(
      JSON.stringify({
        entities: snapshot.entities,
        mentions: snapshot.mentions,
        relationships: snapshot.relationships,
        topics: snapshot.topicPages,
      }),
    ),
    'graph.json',
  );
  for (const [path, source] of paths) {
    zip.addReadStreamLazy(path, { size: source.size }, (callback) => {
      void verifiedOriginal(storage, source).then(
        (stream) => callback(null, stream),
        (error) => callback(error, Readable.from([])),
      );
    });
  }
  for (const image of snapshot.images) {
    zip.addReadStreamLazy(
      readingImagePath(image.item_id, image),
      { size: image.size },
      (callback) => {
        void storage.get(image.object_key).then(
          (source) => callback(null, source),
          (error) => callback(error, Readable.from([])),
        );
      },
    );
  }
  for (const item of snapshot.items) {
    const slug =
      item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'saved-item';
    zip.addBuffer(
      Buffer.from(markdown.get(item.id) ?? ''),
      `markdown/${slug}-${item.id.slice(0, 8)}.md`,
    );
  }
  zip.end();
  return output;
}
