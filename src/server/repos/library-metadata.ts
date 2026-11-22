import type { Queryable } from '@/server/db';

export async function countLibraryBuckets(db: Queryable, userId: string) {
  const { rows } = await db.query<{ bucket: string; count: string }>(
    `WITH typed AS (
   SELECT archived,favorite,progress,CASE
    WHEN bookmark_type IS NOT NULL THEN 'Bookmarks'
    WHEN source_details ? 'quote' THEN 'Quote'
    WHEN EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id AND m.kind IN ('youtube','social')) THEN 'Video'
    WHEN EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id AND m.kind='podcast') THEN 'Podcast'
    WHEN EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=item.id AND m.user_id=item.user_id AND m.kind='audio') THEN 'Audio'
    ELSE CASE kind WHEN 'article' THEN 'Article' WHEN 'note' THEN 'Note' WHEN 'pdf' THEN 'PDF' WHEN 'image' THEN 'Image' WHEN 'spreadsheet' THEN 'Excel' END END AS type
   FROM item WHERE user_id=$1)
  SELECT 'status:all' AS bucket,count(*) FILTER (WHERE NOT archived) AS count FROM typed
  UNION ALL SELECT 'status:progress',count(*) FILTER (WHERE NOT archived AND progress>0 AND progress<1) FROM typed
  UNION ALL SELECT 'status:finished',count(*) FILTER (WHERE NOT archived AND progress>=1) FROM typed
  UNION ALL SELECT 'status:favorites',count(*) FILTER (WHERE NOT archived AND favorite) FROM typed
  UNION ALL SELECT 'status:archived',count(*) FILTER (WHERE archived) FROM typed
  UNION ALL SELECT 'type:'||type,count(*) FROM typed WHERE NOT archived AND type IS NOT NULL GROUP BY type
  UNION ALL SELECT 'topic:'||t.name,count(*) FROM knowledge_tag t
    JOIN item i ON i.id=t.item_id AND i.user_id=t.user_id
    WHERE t.user_id=$1 AND t.origin!='dismissed' AND NOT i.archived GROUP BY t.name`,
    [userId],
  );
  return rows;
}

export async function listActiveTopics(db: Queryable, userId: string) {
  const { rows } = await db.query<{ name: string }>(
    `SELECT DISTINCT t.name FROM knowledge_tag t
    JOIN item i ON i.id=t.item_id AND i.user_id=t.user_id
    WHERE t.user_id=$1 AND t.origin!='dismissed' AND NOT i.archived ORDER BY t.name`,
    [userId],
  );
  return rows.map((row) => row.name);
}

export function readTopicPage(db: Queryable, userId: string, topic: string) {
  return db.query('SELECT overview,updated_at FROM topic_page WHERE user_id=$1 AND topic=$2', [
    userId,
    topic,
  ]);
}

export function findActiveTopic(db: Queryable, userId: string, topic: string) {
  return db.query(
    "SELECT 1 FROM knowledge_tag t JOIN item i ON i.id=t.item_id AND i.user_id=t.user_id WHERE t.user_id=$1 AND t.name=$2 AND t.origin!='dismissed' AND NOT i.archived LIMIT 1",
    [userId, topic],
  );
}

export function upsertTopicPage(db: Queryable, userId: string, topic: string, overview: string) {
  return db.query(
    'INSERT INTO topic_page(user_id,topic,overview) VALUES($1,$2,$3) ON CONFLICT(user_id,topic) DO UPDATE SET overview=$3,updated_at=now()',
    [userId, topic, overview],
  );
}
