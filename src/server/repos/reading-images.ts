import type { Queryable } from '@/server/db';

export type ReadingImage = {
  slot: number;
  object_key: string;
  mime: string;
  size: number;
};

export async function findReadingImage(
  db: Queryable,
  userId: string,
  itemId: string,
  slot: number,
) {
  const { rows } = await db.query<ReadingImage>(
    'SELECT slot, object_key, mime, size FROM reading_image WHERE item_id=$1 AND user_id=$2 AND slot=$3',
    [itemId, userId, slot],
  );
  return rows[0];
}

export async function replaceReadingImages(
  db: Queryable,
  userId: string,
  itemId: string,
  images: ReadingImage[],
) {
  await db.query('DELETE FROM reading_image WHERE item_id=$1 AND user_id=$2', [itemId, userId]);
  if (!images.length) return;
  await db.query(
    `INSERT INTO reading_image(item_id, user_id, slot, object_key, mime, size)
      SELECT $1,$2,slot,object_key,mime,size FROM jsonb_to_recordset($3::jsonb)
        AS asset(slot integer, object_key text, mime text, size integer)`,
    [itemId, userId, JSON.stringify(images)],
  );
}
