import type { Queryable } from '@/server/db';
import type { Passage } from '@/shared/passages';

export function findImportedHighlight(
  db: Queryable,
  userId: string,
  itemId: string,
  quote: string,
) {
  return db.query('SELECT 1 FROM highlight WHERE user_id=$1 AND item_id=$2 AND quote=$3', [
    userId,
    itemId,
    quote,
  ]);
}

export function lockLegacyImportDuplicate(db: Queryable, userId: string, url: string) {
  return db.query<{ id: string; passages: Passage[] }>(
    'SELECT id,passages FROM item WHERE user_id=$1 AND url=$2 FOR UPDATE',
    [userId, url],
  );
}

export function insertLegacyImportItem(
  db: Queryable,
  id: string,
  userId: string,
  title: string,
  url: string,
  domain: string,
  excerpt: string,
  passagesJson: string,
  words: number,
  createdAt: string | null,
  archived: boolean,
  favorite: boolean,
  bookmarkType: 'website' | null,
  html: string,
) {
  return db.query(
    `INSERT INTO item(id,user_id,kind,title,url,domain,excerpt,passages,words,created_at,archived,favorite,bookmark_type,reading_html)
        VALUES($1,$2,'article',$3,$4,$5,$6,$7::jsonb,$8,COALESCE($9,now()),$10,$11,$12,$13)`,
    [
      id,
      userId,
      title,
      url,
      domain,
      excerpt,
      passagesJson,
      words,
      createdAt,
      archived,
      favorite,
      bookmarkType,
      html,
    ],
  );
}

export function findImportedItem(
  db: Queryable,
  userId: string,
  sourceId: string,
  url: string | null,
  quoteKey: string | null,
) {
  return db.query<{ id: string; passages: Passage[] }>(
    `SELECT i.id,i.passages FROM imported_item_origin o
        JOIN item i ON i.id=o.item_id AND i.user_id=o.user_id WHERE o.user_id=$1 AND o.source_id=$2
        UNION ALL SELECT id,passages FROM item WHERE user_id=$1 AND (id=$2 OR (url=$3 AND $3::text IS NOT NULL)
          OR (quote_key=$4 AND $4::text IS NOT NULL)) LIMIT 1`,
    [userId, sourceId, url, quoteKey],
  );
}

export function restoreKnowledgeSummary(
  db: Queryable,
  summary: string,
  id: string,
  userId: string,
) {
  return db.query('UPDATE knowledge_job SET summary=$1 WHERE item_id=$2 AND user_id=$3', [
    summary,
    id,
    userId,
  ]);
}

export function recordImportedItemOrigin(
  db: Queryable,
  userId: string,
  sourceId: string,
  id: string,
) {
  return db.query(
    'INSERT INTO imported_item_origin(user_id,source_id,item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [userId, sourceId, id],
  );
}

export function restoreItemTurn(db: Queryable, id: string, userId: string, turnId: string) {
  return db.query('UPDATE item SET origin_turn_id=$3 WHERE id=$1 AND user_id=$2', [
    id,
    userId,
    turnId,
  ]);
}

const columns = {
  item: 'id user_id kind title url domain author excerpt reading_html passages source_name published_at words status error archived favorite progress channel created_at updated_at last_read_at reader_position bookmark_type source_details quote_key sample_key',
  note_document: 'item_id document version updated_at',
  library_thread: 'id user_id title created_at',
  library_turn:
    'id user_id thread_id request_id question answer model web state sources input_tokens output_tokens created_at finished_at',
  media_source:
    'item_id user_id kind stage duration_seconds language generated segments audio_url transcript_url fingerprint warning',
  item_source_raw: 'item_id user_id provider version fetched_at data',
  topic_page: 'user_id topic overview updated_at',
} as const;
/** Only schema-owned identifiers reach SQL. Data is bound as a JSON value. */
export async function restoreRow(
  tx: Queryable,
  table: keyof typeof columns,
  data: Record<string, unknown>,
) {
  const fields = columns[table]
    .split(' ')
    .filter((field) => Object.hasOwn(data, field) && data[field] !== undefined)
    .join(',');
  return tx.query(
    `INSERT INTO ${table} (${fields}) SELECT ${fields} FROM jsonb_populate_record(NULL::${table},$1::jsonb)
    ON CONFLICT DO NOTHING RETURNING ${table === 'note_document' || table === 'media_source' || table === 'item_source_raw' ? 'item_id' : table === 'topic_page' ? 'topic' : 'id'}`,
    [JSON.stringify(data)],
  );
}
