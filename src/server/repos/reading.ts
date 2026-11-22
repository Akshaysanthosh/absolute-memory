import type { Queryable } from '@/server/db';
import type { HighlightSegment, Passage } from '@/shared/passages';

export type ReadingItem = {
  id: string;
  title: string;
  kind: 'article' | 'note' | 'pdf' | 'image' | 'spreadsheet';
  domain: string | null;
  excerpt: string;
  has_source: boolean;
  image_info: { description: string; brand: string } | null;
  url: string | null;
  author: string | null;
  source_name: string | null;
  published_at: string | null;
  reading_html: string;
  lead_image: string | null;
  passages: Passage[];
  reader_position: number | null;
  progress: number;
  words: number;
  status: string;
  error: string | null;
};

export type StoredHighlight = {
  id: string;
  itemId: string;
  title: string;
  quote: string;
  createdAt: string;
  segments: HighlightSegment[];
};

export async function getReadingItem(db: Queryable, userId: string, itemId: string, lock = false) {
  const { rows } = await db.query<ReadingItem>(
    `SELECT id, title, kind, domain, excerpt, url, author, source_name, published_at, reading_html, passages,
      reader_position, progress, words, status, error,
      EXISTS (SELECT 1 FROM source_file f WHERE f.item_id = item.id AND f.user_id = item.user_id) AS has_source,
      source_details->'image' AS image_info,
      source_details->>'thumbnailUrl' AS lead_image
     FROM item WHERE id = $1 AND user_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
    [itemId, userId],
  );
  return rows[0];
}

export async function saveReadingPosition(
  db: Queryable,
  userId: string,
  itemId: string,
  passageIndex: number,
  progress: number,
) {
  const result = await db.query(
    `UPDATE item SET reader_position = $3, progress = $4, last_read_at = now()
      WHERE id = $1 AND user_id = $2 AND $3 < jsonb_array_length(passages)
      RETURNING id`,
    [itemId, userId, passageIndex, progress],
  );
  return result.rows.length > 0;
}

export async function insertHighlight(
  db: Queryable,
  userId: string,
  itemId: string,
  id: string,
  quote: string,
  segments: HighlightSegment[],
  createdAt?: string,
) {
  const { rows } = await db.query(
    `INSERT INTO highlight(id, user_id, item_id, quote, created_at)
      VALUES ($1, $2, $3, $4, COALESCE($5, now())) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [id, userId, itemId, quote, createdAt ?? null],
  );
  if (rows.length) await writeSegments(db, id, segments);
}

async function writeSegments(db: Queryable, id: string, segments: HighlightSegment[]) {
  if (!segments.length) return;
  await db.query(
    `INSERT INTO highlight_segment(highlight_id, passage_index, start_offset, end_offset, quoted_text)
       SELECT $1, "passageIndex", start, "end", text FROM jsonb_to_recordset($2::jsonb)
         AS part("passageIndex" integer, start integer, "end" integer, text text)`,
    [id, JSON.stringify(segments)],
  );
}

export async function replaceHighlightSegments(
  db: Queryable,
  id: string,
  segments: HighlightSegment[],
) {
  await db.query('DELETE FROM highlight_segment WHERE highlight_id=$1', [id]);
  await writeSegments(db, id, segments);
}

export async function deleteHighlight(db: Queryable, userId: string, itemId: string, id: string) {
  const result = await db.query(
    'DELETE FROM highlight WHERE id = $1 AND user_id = $2 AND item_id = $3 RETURNING id',
    [id, userId, itemId],
  );
  return result.rows.length > 0;
}

export async function getHighlights(
  db: Queryable,
  userId: string,
  options: { itemId?: string; limit: number | null; offset: number },
) {
  const { rows } = await db.query<StoredHighlight>(
    `SELECT h.id, h.item_id AS "itemId", i.title, h.quote, h.created_at AS "createdAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'passageIndex', s.passage_index, 'start', s.start_offset, 'end', s.end_offset, 'text', s.quoted_text
      ) ORDER BY s.passage_index) FROM highlight_segment s WHERE s.highlight_id = h.id), '[]') AS segments
      FROM highlight h JOIN item i ON i.id = h.item_id AND i.user_id = h.user_id
      WHERE h.user_id = $1 AND ($2::uuid IS NULL OR h.item_id = $2)
      ORDER BY h.created_at DESC, h.id DESC LIMIT $3 OFFSET $4`,
    [userId, options.itemId ?? null, options.limit, options.offset],
  );
  return rows;
}

export async function getReadingMedia(db: Queryable, userId: string, itemId: string) {
  const { rows } = await db.query<{
    kind: 'youtube' | 'podcast' | 'social' | 'audio';
    audio_url: string | null;
    warning: string | null;
  }>('SELECT kind, audio_url, warning FROM media_source WHERE item_id=$1 AND user_id=$2', [
    itemId,
    userId,
  ]);
  return rows[0];
}
