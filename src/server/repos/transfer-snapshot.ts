import type { Queryable } from '@/server/db';
import { getHighlights } from '@/server/repos/reading';
import type { Passage } from '@/shared/passages';
import type { mimeExtensions, PortableImage } from '@/server/services/transfers/format';

type Row = Record<string, unknown>;
export type Item = Row & {
  id: string;
  title: string;
  url: string | null;
  created_at: Date | string;
  passages: Passage[];
};
type Image = Row & PortableImage & { item_id: string; object_key: string };
export type File = Row & {
  item_id: string;
  object_key: string;
  name: string;
  mime: keyof typeof mimeExtensions;
  size: number;
  digest: string;
  pages: number;
  method: string;
};
export type Thread = Row & { id: string };
export type Message = Row & { thread_id: string };

const ownedTables = ['library_thread', 'library_turn', 'knowledge_entity'] as const;
async function ownedRows<T extends Row>(
  db: Queryable,
  table: (typeof ownedTables)[number],
  userId: string,
) {
  const { rows } = await db.query<T>(`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY id`, [
    userId,
  ]);
  return rows.map(({ user_id, ...row }) => row as T);
}

export async function readTransferSnapshot(tx: Queryable, userId: string) {
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const [
    items,
    highlights,
    notes,
    libraryThreads,
    libraryMessages,
    tags,
    files,
    images,
    media,
    raw,
    entities,
    mentions,
    relationships,
    summaries,
    topicPages,
  ] = await Promise.all([
    tx.query<Item>('SELECT * FROM item WHERE user_id=$1 ORDER BY created_at,id', [userId]),
    getHighlights(tx, userId, { limit: null, offset: 0 }),
    tx.query<Row>(
      'SELECT n.* FROM note_document n JOIN item i ON n.item_id=i.id WHERE i.user_id=$1 ORDER BY n.item_id',
      [userId],
    ),
    ownedRows<Thread>(tx, 'library_thread', userId),
    ownedRows<Message>(tx, 'library_turn', userId),
    tx.query<{ item_id: string; name: string; origin: string }>(
      "SELECT item_id,name,origin FROM knowledge_tag WHERE user_id=$1 AND origin<>'dismissed' ORDER BY item_id,name",
      [userId],
    ),
    tx.query<File>(
      'SELECT item_id,object_key,name,mime,digest,size,pages,method FROM source_file WHERE user_id=$1 ORDER BY item_id',
      [userId],
    ),
    tx.query<Image>(
      'SELECT item_id,slot,object_key,mime,size FROM reading_image WHERE user_id=$1 ORDER BY item_id,slot',
      [userId],
    ),
    tx.query<Row>(
      'SELECT item_id,kind,stage,duration_seconds,language,generated,segments,audio_url,transcript_url,fingerprint,warning FROM media_source WHERE user_id=$1 ORDER BY item_id',
      [userId],
    ),
    tx.query<Row>(
      'SELECT item_id,provider,version,fetched_at,data FROM item_source_raw WHERE user_id=$1 ORDER BY item_id',
      [userId],
    ),
    ownedRows(tx, 'knowledge_entity', userId),
    tx.query<Row>(
      'SELECT m.entity_id,c.item_id,m.chunk_id,m.evidence,c.passage_indices FROM knowledge_mention m JOIN knowledge_chunk c ON m.chunk_id=c.id AND m.user_id=c.user_id WHERE m.user_id=$1 ORDER BY c.item_id,m.entity_id',
      [userId],
    ),
    tx.query<Row>(
      'SELECT e.id,e.source_id,e.target_id,e.label,e.chunk_id,e.evidence,c.item_id,c.passage_indices FROM knowledge_edge e JOIN knowledge_chunk c ON e.chunk_id=c.id AND e.user_id=c.user_id WHERE e.user_id=$1 ORDER BY e.id',
      [userId],
    ),
    tx.query<Row>(
      "SELECT item_id,summary FROM knowledge_job WHERE user_id=$1 AND summary<>'' ORDER BY item_id",
      [userId],
    ),
    tx.query<Row>(
      'SELECT topic,overview,updated_at FROM topic_page WHERE user_id=$1 ORDER BY topic',
      [userId],
    ),
  ]);
  return {
    items: items.rows,
    highlights,
    notes: notes.rows,
    libraryThreads,
    libraryMessages,
    tags: tags.rows,
    files: files.rows,
    images: images.rows,
    media: media.rows,
    raw: raw.rows,
    entities,
    mentions: mentions.rows,
    relationships: relationships.rows,
    summaries: summaries.rows,
    topicPages: topicPages.rows,
  };
}
