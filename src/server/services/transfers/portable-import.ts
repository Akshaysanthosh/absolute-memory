import { lockUser } from '@/server/repos/users';
import {
  findImportedItem,
  restoreKnowledgeSummary,
  recordImportedItemOrigin,
  restoreItemTurn,
  restoreRow,
} from '@/server/repos/transfer-restoration';
import { findMediaFingerprint } from '@/server/repos/media-sources';
import { restoreImportJob } from '@/server/repos/import-jobs';
import { findOwnedItemId } from '@/server/repos/items';
import { restoreManualTags } from '@/server/repos/item-tags';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '@/server/auth/http';
import type { Database, Queryable } from '@/server/db';
import { verifyWorkbook } from '@/server/services/workbook-upload';
import { maximumUploadBytes } from '@/server/config';
import { fileType } from '@/server/services/documents';
import { documentDigest, storeOriginal } from '@/server/services/document-assets';
import { normalizeUrl } from '@/server/services/extract';
import { youtubeVideoId } from '@/server/services/thumbnails';
import { normalizedTag } from '@/server/services/knowledge/content';
import { validateNoteDocument } from '@/shared/note-document';
import { segmentSchema } from '@/shared/media/transcript';
import { webURL } from '@/server/services/import/content';
import { insertHighlight } from '@/server/repos/reading';
import { findQuote, validateSegments, type Passage } from '@/shared/passages';
import { withUnpackedArchive, type ArchiveFiles, type TransferSource } from './archive';
import {
  dataFiles,
  decodeJson,
  decodeJsonl,
  manifestSchema,
  mimeExtensions,
  portableChat,
  portableHighlight,
  portableItem,
  portableNote,
} from './format';
import { restoreReading } from './portable-reading';

const sections = new Set([
  'manifest.json',
  'graph.json',
  ...dataFiles.map((name) => `${name}.jsonl`),
]);
type RecordData = Record<string, unknown>;

function stableId(userId: string, table: string, exported: string) {
  const id = createHash('sha256')
    .update(JSON.stringify([userId, table, exported]))
    .digest('hex');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`;
}

export function canonicalImportUrl(input: string) {
  const url = normalizeUrl(input);
  const video = youtubeVideoId(url);
  return video ? `https://www.youtube.com/watch?v=${video}` : url;
}

const mediaSchema = z.looseObject({
  kind: z.enum(['youtube', 'podcast', 'audio', 'social']),
  stage: z.enum(['metadata', 'native', 'complete']),
  segments: z.array(segmentSchema),
  audio_url: z.string().nullable(),
  transcript_url: z.string().nullable(),
});
const rawSchema = z.looseObject({
  provider: z.enum(['reddit', 'article', 'extension', 'podcast']),
  data: z.json(),
});
const graphSchema = z.object({
  topics: z
    .array(z.looseObject({ topic: z.string().max(60), overview: z.string().max(100000) }))
    .default([]),
});
const chatSources = z.array(
  z.looseObject({ itemId: z.uuid().optional(), url: z.string().optional() }),
);

function remapSources(sources: unknown, items: Map<string, string>) {
  const parsed = chatSources.safeParse(sources);
  if (!parsed.success) return [];
  return parsed.data.flatMap<RecordData>((source) => {
    if (source.itemId) {
      const itemId = items.get(source.itemId);
      return itemId
        ? [{ ...source, itemId }]
        : [{ ...source, itemId: randomUUID(), available: false }];
    }
    const url = source.url && webURL(source.url);
    return url ? [{ ...source, url }] : [];
  });
}

type ImportResult = { created: number; duplicates: number };
type ImportCheckpoint = {
  lock(tx: Queryable): Promise<boolean>;
  complete(tx: Queryable, result: ImportResult): Promise<void>;
};

const assetPath = /^(?:files|reading-images)\//;
export function importPortableLibrary(
  userId: string,
  source: TransferSource,
  db: Database,
  checkpoint?: ImportCheckpoint,
) {
  return withUnpackedArchive(
    source,
    (name) => sections.has(name) || assetPath.test(name),
    (archive) => restorePortableLibrary(userId, archive, db, checkpoint),
    (name) => !assetPath.test(name),
  );
}

async function restorePortableLibrary(
  userId: string,
  archive: ArchiveFiles,
  db: Database,
  checkpoint?: ImportCheckpoint,
) {
  const manifest = decodeJson(await archive.read('manifest.json'), manifestSchema, 'manifest.json');
  const items = await decodeJsonl(archive.entries.get('items.jsonl'), portableItem, 'items.jsonl');
  const highlights = await decodeJsonl(
    archive.entries.get('highlights.jsonl'),
    portableHighlight,
    'highlights.jsonl',
  );
  const notes = await decodeJsonl(archive.entries.get('notes.jsonl'), portableNote, 'notes.jsonl');
  const chats = await decodeJsonl(archive.entries.get('chats.jsonl'), portableChat, 'chats.jsonl');
  const graph = decodeJson(await archive.read('graph.json'), graphSchema, 'graph.json');
  const namedFiles = new Set(items.flatMap((item) => (item.file ? [item.file.path] : [])));
  const counts = {
    items: items.length,
    highlights: highlights.length,
    notes: notes.length,
    chats: chats.length,
    files: namedFiles.size,
  };
  if (
    dataFiles.some((name) => counts[name] !== manifest.counts[name]) ||
    counts.files !== manifest.counts.files ||
    items.reduce((sum, item) => sum + item.reading_images.length, 0) !==
      manifest.counts.reading_images ||
    items.length !== new Set(items.map((item) => item.id)).size
  ) {
    throw new HttpError(422, 'Archive records do not match the manifest.');
  }

  const planned = new Map<
    string,
    {
      id: string;
      url: string | null;
      file?: Awaited<ReturnType<typeof storeOriginal>>;
      reading: Awaited<ReturnType<typeof restoreReading>>;
    }
  >();
  for (const item of items) {
    const id = stableId(userId, 'item', item.id);
    let url: string | null = null;
    if (item.url) {
      try {
        url = canonicalImportUrl(item.url);
      } catch {
        throw new HttpError(422, 'An item contains an unsupported source URL.');
      }
    }
    let attach;
    if (item.file) {
      if (item.file.size > maximumUploadBytes())
        throw new HttpError(413, 'An original file exceeds the configured file limit.');
      const file = await archive.read(item.file.path);
      if (
        !file ||
        file.length !== item.file.size ||
        documentDigest(file) !== item.file.digest ||
        item.file.path !== `files/${item.file.digest}.${mimeExtensions[item.file.mime]}` ||
        fileType(file, item.file.path) !== item.file.mime
      ) {
        throw new HttpError(422, 'An original file does not match its archive entry.');
      }
      if (item.file.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        await verifyWorkbook(file, AbortSignal.timeout(12_000));
      }
      attach = await storeOriginal(db, userId, id, { ...item.file, data: file });
    }
    planned.set(item.id, {
      id,
      url,
      file: attach,
      reading: await restoreReading(db, archive, item, url),
    });
  }

  return db.transaction(async (tx) => {
    if (checkpoint && !(await checkpoint.lock(tx))) return { created: 0, duplicates: 0 };
    await lockUser(tx, userId);
    const itemMap = new Map<string, string>();
    const itemPassages = new Map<string, Passage[]>();
    let created = 0;
    const imported = new Set<string>();
    for (const item of items) {
      const plan = planned.get(item.id)!;
      const { url } = plan;
      const {
        rows: [existing],
      } = await findImportedItem(
        tx,
        userId,
        item.id,
        url,
        typeof item.quote_key === 'string' ? item.quote_key : null,
      );
      const id = existing?.id ?? plan.id;
      if (existing) itemPassages.set(item.id, existing.passages);
      else {
        const status = item.status === 'processing' ? 'pending' : item.status;
        const { passages } = plan.reading;
        const meta = z.record(z.string(), z.json()).safeParse(item.source_details);
        const { thumbnailUrl, ...details } = meta.success ? meta.data : {};
        const reading = plan.reading.forItem(id, thumbnailUrl);
        const position =
          typeof item.reader_position === 'number' &&
          Number.isInteger(item.reader_position) &&
          item.reader_position >= 0 &&
          item.reader_position < passages.length
            ? item.reader_position
            : null;
        const result = await restoreRow(tx, 'item', {
          ...item,
          id,
          user_id: userId,
          url,
          status,
          reading_html: reading.html,
          passages,
          reader_position: position,
          source_details: { ...details, thumbnailUrl: reading.thumbnailUrl },
        });
        itemPassages.set(item.id, passages);
        if (result.rows.length) {
          created++;
          imported.add(id);
          if (plan.file) await plan.file(tx);
          await reading.attach(tx, userId);
          const media = mediaSchema.safeParse(item.media);
          if (media.success) {
            const input = media.data;
            const fingerprint = typeof input.fingerprint === 'string' ? input.fingerprint : null;
            const duplicate =
              fingerprint && (await findMediaFingerprint(tx, userId, fingerprint)).rows.length;
            await restoreRow(tx, 'media_source', {
              ...input,
              user_id: userId,
              item_id: id,
              fingerprint: duplicate ? null : fingerprint,
              audio_url: input.audio_url ? webURL(input.audio_url) : null,
              transcript_url: input.transcript_url ? webURL(input.transcript_url) : null,
            });
          }
          const raw = rawSchema.safeParse(item.raw);
          if (raw.success)
            await restoreRow(tx, 'item_source_raw', { ...raw.data, user_id: userId, item_id: id });
          if (status === 'pending' || status === 'failed') {
            await restoreImportJob(
              tx,
              randomUUID(),
              id,
              status === 'pending' ? 'queued' : 'failed',
              typeof item.error === 'string' ? item.error : null,
            );
          }
          if (typeof item.summary === 'string')
            await restoreKnowledgeSummary(tx, item.summary.slice(0, 10000), id, userId);
        } else {
          const owned = await findOwnedItemId(tx, id, userId);
          if (!owned.rows.length) throw new Error('The archived item could not be restored.');
        }
      }
      itemMap.set(item.id, id);
      await recordImportedItemOrigin(tx, userId, item.id, id);
      const tags = [
        ...new Set([...item.tags, ...item.topics].map(normalizedTag).filter(Boolean)),
      ].slice(0, 20);
      if (tags.length) await restoreManualTags(tx, userId, id, tags);
    }
    for (const mark of highlights) {
      const id = itemMap.get(mark.item_id);
      if (!id) continue;
      const passages = itemPassages.get(mark.item_id) ?? [];
      const normalize = (text: string) => text.trim().replace(/\s+/gu, ' ');
      const matches =
        normalize(mark.segments.map((segment) => segment.text).join(' ')) === normalize(mark.quote);
      const segments =
        matches && validateSegments(passages, mark.segments)
          ? mark.segments
          : findQuote(passages, mark.quote);
      await insertHighlight(
        tx,
        userId,
        id,
        stableId(userId, 'highlight', mark.id),
        mark.quote,
        segments,
        mark.created_at,
      );
    }
    for (const note of notes) {
      const id = itemMap.get(note.item_id);
      if (id && imported.has(id))
        await restoreRow(tx, 'note_document', {
          ...note,
          item_id: id,
          document: validateNoteDocument(note.document),
        });
    }
    for (const chat of chats) {
      const table = 'library_thread';
      const turns = 'library_turn';
      const threadId = stableId(userId, table, chat.id);
      await restoreRow(tx, table, { ...chat, user_id: userId, id: threadId });
      for (const message of chat.messages) {
        await restoreRow(tx, turns, {
          ...message,
          user_id: userId,
          id: stableId(userId, turns, message.id),
          thread_id: threadId,
          request_id: stableId(userId, 'request', message.id),
          state: message.state === 'running' ? 'stopped' : message.state,
          sources: remapSources(message.sources, itemMap),
        });
      }
    }
    for (const item of items) {
      const id = itemMap.get(item.id)!;
      if (imported.has(id) && typeof item.origin_turn_id === 'string') {
        await restoreItemTurn(
          tx,
          id,
          userId,
          stableId(userId, 'library_turn', item.origin_turn_id),
        );
      }
    }
    for (const topic of graph.topics)
      await restoreRow(tx, 'topic_page', { ...topic, user_id: userId });
    const result = { created, duplicates: items.length - created };
    if (checkpoint) await checkpoint.complete(tx, result);
    return result;
  });
}
