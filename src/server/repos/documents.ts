import type { Item } from '@/shared/types';
import type { Queryable } from '@/server/db';

export type DocumentSource = {
  name: string;
  mime: string;
  size: number;
  pages: number;
  method: string;
  digest: string;
  object_key: string;
};

export async function findDocument(userId: string, itemId: string, db: Queryable) {
  const {
    rows: [file],
  } = await db.query<DocumentSource>(
    'SELECT name, mime, size, pages, method, digest, object_key FROM source_file WHERE user_id=$1 AND item_id=$2',
    [userId, itemId],
  );
  return file;
}

export async function insertDocument(
  userId: string,
  itemId: string,
  file: DocumentSource,
  tx: Queryable,
) {
  await tx.query(
    `INSERT INTO source_file(item_id,user_id,name,mime,size,pages,method,digest,object_key)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(item_id) DO UPDATE SET name=EXCLUDED.name,mime=EXCLUDED.mime,size=EXCLUDED.size,
       pages=EXCLUDED.pages,method=EXCLUDED.method,digest=EXCLUDED.digest,object_key=EXCLUDED.object_key
       WHERE source_file.user_id=EXCLUDED.user_id`,
    [
      itemId,
      userId,
      file.name,
      file.mime,
      file.size,
      file.pages,
      file.method,
      file.digest,
      file.object_key,
    ],
  );
}

export async function trackStagedObject(db: Queryable, key: string) {
  await db.query('INSERT INTO document_asset_cleanup(object_key) VALUES($1)', [key]);
}

export async function forgetStagedObject(db: Queryable, key: string) {
  await db.query('DELETE FROM document_asset_cleanup WHERE object_key=$1', [key]);
}

export async function claimUnusedObjects(db: Queryable) {
  const { rows } = await db.query<{ object_key: string }>(`
    UPDATE document_asset_cleanup SET available_at=now()+interval '15 minutes'
    WHERE object_key IN (
      SELECT object_key FROM document_asset_cleanup WHERE available_at<=now()
      ORDER BY available_at LIMIT 10 FOR UPDATE SKIP LOCKED
    ) RETURNING object_key
  `);
  return rows.map((row) => row.object_key);
}

export async function objectIsReferenced(db: Queryable, key: string) {
  const { rows } = await db.query(
    'SELECT 1 FROM source_file WHERE object_key=$1 UNION ALL SELECT 1 FROM document_asset WHERE object_key=$1 UNION ALL SELECT 1 FROM media_source WHERE audio_object_key=$1 UNION ALL SELECT 1 FROM transfer_job WHERE input_key=$1 OR output_key=$1 UNION ALL SELECT 1 FROM reading_image WHERE object_key=$1',
    [key],
  );
  return rows.length > 0;
}

export function insertDocumentItem(
  db: Queryable,
  itemId: string,
  userId: string,
  kind: 'spreadsheet' | 'pdf' | 'image',
  title: string,
  domain: string,
  excerpt: string,
  passagesJson: string,
  words: number,
  html: string,
) {
  return db.query(
    'INSERT INTO item(id,user_id,kind,title,domain,excerpt,passages,words,reading_html) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',
    [itemId, userId, kind, title, domain, excerpt, passagesJson, words, html],
  );
}

export function findVerifiedThumbnailAsset(
  db: Queryable,
  itemId: string,
  userId: string,
  digest: string,
) {
  return db.query<{ object_key: string; size: number; content_digest: string }>(
    `
    SELECT object_key,size,content_digest FROM document_asset
    WHERE item_id=$1 AND user_id=$2 AND variant='thumbnail-v1' AND digest=$3 AND verified_at IS NOT NULL
  `,
    [itemId, userId, digest],
  );
}

export function upsertThumbnailAsset(
  db: Queryable,
  itemId: string,
  userId: string,
  digest: string,
  key: string,
  size: number,
  mime: string,
  checksum: string,
) {
  return db.query(
    `
      WITH source AS (
        SELECT item_id,user_id FROM source_file WHERE item_id=$1 AND user_id=$2 AND digest=$3 FOR SHARE
      )
      INSERT INTO document_asset(item_id,user_id,variant,digest,object_key,size,mime,content_digest,verified_at)
      SELECT item_id,user_id,'thumbnail-v1',$3,$4,$5,$6,$7,now() FROM source
      ON CONFLICT(item_id,variant) DO NOTHING RETURNING object_key
    `,
    [itemId, userId, digest, key, size, mime, checksum],
  );
}

export function findThumbnailSource(db: Queryable, itemId: string, userId: string) {
  return db.query<{ digest: string; mime: string }>(
    'SELECT f.digest AS digest,f.mime FROM source_file f JOIN item i ON i.id=f.item_id AND i.user_id=f.user_id WHERE f.item_id=$1 AND f.user_id=$2',
    [itemId, userId],
  );
}

export function findImageAnalysisState(db: Queryable, itemId: string, userId: string) {
  return db.query<{ analyzed: boolean }>(
    `
    SELECT COALESCE(i.source_details ? 'image',false) AS analyzed
    FROM source_file f JOIN item i ON i.id=f.item_id AND i.user_id=f.user_id
    WHERE f.item_id=$1 AND f.user_id=$2 AND i.kind='image'`,
    [itemId, userId],
  );
}

export function updateImageAnalysis(
  db: Queryable,
  itemId: string,
  userId: string,
  detailsJson: string,
  passagesJson: string,
  words: number,
  excerpt: string,
  title: string,
  html: string,
) {
  return db.query(
    `UPDATE item SET source_details=COALESCE(NULLIF(source_details,'null'::jsonb),'{}'::jsonb)||$3::jsonb,
      title=CASE WHEN COALESCE((source_details->>'titleEdited')::boolean,false) THEN title ELSE $7 END,
      passages=CASE WHEN words>0 THEN passages ELSE $4::jsonb END,
      reading_html=CASE WHEN words>0 THEN reading_html ELSE $8 END,
      words=CASE WHEN words>0 THEN words ELSE $5 END,
      excerpt=CASE WHEN words>0 THEN excerpt ELSE $6 END,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND kind='image' AND NOT COALESCE(source_details ? 'image',false) RETURNING id`,
    [itemId, userId, detailsJson, passagesJson, words, excerpt, title, html],
  );
}

export function recordImageAnalysisMethod(db: Queryable, itemId: string, userId: string) {
  return db.query(
    "UPDATE source_file SET method='AI image analysis' WHERE item_id=$1 AND user_id=$2",
    [itemId, userId],
  );
}

export function findDocumentByDigest(db: Queryable, userId: string, digest: string) {
  return db.query<{ id: string; status: Item['status'] }>(
    `
      SELECT i.id,i.status FROM source_file f JOIN item i ON i.id=f.item_id AND i.user_id=f.user_id
      WHERE f.user_id=$1 AND f.digest=$2 ORDER BY f.created_at,i.id LIMIT 1`,
    [userId, digest],
  );
}
