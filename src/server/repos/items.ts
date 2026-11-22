import type { Queryable } from '@/server/db';
import type { Item } from '@/shared/types';
type StatusRow = Pick<Item, 'id' | 'status' | 'media_kind' | 'knowledge_state' | 'reading_ready'>;

export function findOwnedItem(db: Queryable, id: string, userId: string) {
  return db.query<Item>('SELECT * FROM item WHERE id=$1 AND user_id=$2', [id, userId]);
}

export function findOwnedItemId(db: Queryable, id: string, userId: string) {
  return db.query('SELECT id FROM item WHERE id=$1 AND user_id=$2', [id, userId]);
}

export function readItemWithSource(db: Queryable, id: string, userId: string) {
  return db.query<Item & Record<string, unknown>>(
    "SELECT item.*,(SELECT m.stage FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id) AS media_stage,(SELECT m.kind FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id) AS media_kind,(SELECT jsonb_build_object('name',f.name,'pages',f.pages) FROM source_file f WHERE f.item_id=item.id AND f.user_id=item.user_id) AS source_file FROM item WHERE id=$1 AND user_id=$2",
    [id, userId],
  );
}

export function updateItemBookmark(
  db: Queryable,
  id: string,
  userId: string,
  type: 'website' | 'product' | null,
) {
  return db.query(
    `UPDATE item SET bookmark_type=COALESCE($3,bookmark_type,'website'),
      status='ready',error=NULL,updated_at=now()
    WHERE id=$1 AND user_id=$2 AND kind='article' AND url IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM media_source WHERE item_id=$1)
    RETURNING id`,
    [id, userId, type],
  );
}

export function readItemStatus(db: Queryable, id: string, userId: string) {
  return db.query<StatusRow>(
    `SELECT i.id,i.status,m.kind AS media_kind,j.state AS knowledge_state
  FROM item i LEFT JOIN media_source m ON m.item_id=i.id AND m.user_id=i.user_id
  LEFT JOIN knowledge_job j ON j.item_id=i.id AND j.user_id=i.user_id
  WHERE i.id=$1 AND i.user_id=$2`,
    [id, userId],
  );
}

export function updateFailedItemError(db: Queryable, id: string, userId: string, error: string) {
  return db.query(
    "UPDATE item SET error=$3,updated_at=now() WHERE id=$1 AND user_id=$2 AND status='failed'",
    [id, userId, error],
  );
}

export function markItemPendingIfFailed(db: Queryable, id: string, userId: string) {
  return db.query(
    "UPDATE item SET status='pending',error=NULL WHERE id=$1 AND user_id=$2 AND status='failed' AND kind='article'",
    [id, userId],
  );
}

export async function updateItemTitle(db: Queryable, id: string, userId: string, title: string) {
  await db.query(
    `UPDATE item SET title=$3,
    source_details=COALESCE(NULLIF(source_details,'null'::jsonb),'{}'::jsonb)||'{"titleEdited":true}'::jsonb,
    updated_at=now() WHERE id=$1 AND user_id=$2`,
    [id, userId, title],
  );
}

export async function updateItemState(
  db: Queryable,
  id: string,
  userId: string,
  state: { favorite?: boolean; archived?: boolean; progress?: number },
) {
  await db.query(
    `UPDATE item SET favorite=COALESCE($3,favorite), archived=COALESCE($4,archived),
    progress=GREATEST(COALESCE($5,progress),progress),
    last_read_at=CASE WHEN $5::real IS NOT NULL THEN now() ELSE last_read_at END,
    updated_at=now() WHERE id=$1 AND user_id=$2`,
    [id, userId, state.favorite ?? null, state.archived ?? null, state.progress ?? null],
  );
}

export async function deleteOwnedItem(db: Queryable, id: string, userId: string) {
  await db.query('DELETE FROM item WHERE id=$1 AND user_id=$2', [id, userId]);
}

export function lockOwnedItem(db: Queryable, id: string, userId: string) {
  return db.query('SELECT id FROM item WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, userId]);
}

export function findOwnedItemIds(db: Queryable, userId: string, ids: string[]) {
  return db.query('SELECT id FROM item WHERE user_id=$1 AND id=ANY($2::uuid[])', [userId, ids]);
}

export function markItemProcessing(db: Queryable, id: string) {
  return db.query("UPDATE item SET status='processing',error=NULL WHERE id=$1", [id]);
}

export function readImportSource(db: Queryable, id: string) {
  return db.query<{ url: string; user_id: string }>('SELECT url,user_id FROM item WHERE id=$1', [
    id,
  ]);
}

export function setImportedDocumentKind(db: Queryable, id: string, kind: 'image' | 'pdf') {
  return db.query('UPDATE item SET kind=$2 WHERE id=$1', [id, kind]);
}

export function finishArticleImport(
  db: Queryable,
  id: string,
  title: string,
  author: string | null,
  excerpt: string,
  passagesJson: string,
  words: number,
  domain: string,
  bookmarkType: 'website' | 'product' | null,
  detailsJson: string,
  html: string,
  sourceName: string | null,
  publishedAt: string | null,
) {
  return db.query(
    "UPDATE item SET title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE $2 END,author=$3,excerpt=$4,passages=$5::jsonb,reading_html=$10,source_name=$11,published_at=$12,words=$6,domain=$7,status='ready',error=NULL,bookmark_type=$8,source_details=COALESCE(NULLIF($9::jsonb,'null'::jsonb),'{}'::jsonb)||CASE WHEN source_details->>'titleEdited'='true' THEN '{\"titleEdited\":true}'::jsonb ELSE '{}'::jsonb END,updated_at=now() WHERE id=$1",
    [
      id,
      title,
      author,
      excerpt,
      passagesJson,
      words,
      domain,
      bookmarkType,
      detailsJson,
      html,
      sourceName,
      publishedAt,
    ],
  );
}

export function findItemWithSocialSnapshot(db: Queryable, id: string) {
  return db.query(
    "SELECT id FROM item WHERE id=$1 AND source_details#>'{social,post}' IS NOT NULL",
    [id],
  );
}

export function recordImportStatus(
  db: Queryable,
  id: string,
  status: 'pending' | 'failed',
  error: string,
) {
  return db.query('UPDATE item SET status=$2,error=$3 WHERE id=$1', [id, status, error]);
}
