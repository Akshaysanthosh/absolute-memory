import type { Queryable } from '@/server/db';

export function insertBookmarkTag(db: Queryable, id: string) {
  return db.query(
    `INSERT INTO knowledge_tag (user_id,item_id,name,origin)
    SELECT user_id,id,'bookmarks','auto' FROM item WHERE id=$1
    ON CONFLICT(item_id,name) DO NOTHING`,
    [id],
  );
}

export function insertSourceTags(db: Queryable, id: string, names: string[]) {
  return db.query(
    `INSERT INTO knowledge_tag(user_id,item_id,name,origin)
    SELECT i.user_id,i.id,names.name,'source'
    FROM item i CROSS JOIN unnest($2::text[]) WITH ORDINALITY AS names(name,position)
    WHERE i.id=$1 AND NOT EXISTS (SELECT 1 FROM knowledge_tag t WHERE t.item_id=$1 AND t.name=names.name)
    ORDER BY names.position LIMIT GREATEST(0,20-(SELECT count(*) FROM knowledge_tag WHERE item_id=$1 AND origin<>'dismissed'))
    ON CONFLICT(item_id,name) DO NOTHING`,
    [id, names],
  );
}

export function listSourceTagsForItems(db: Queryable, userId: string, ids: string[]) {
  return db.query<{ name: string }>(
    "SELECT DISTINCT name FROM knowledge_tag WHERE user_id=$1 AND item_id=ANY($2::uuid[]) AND origin!='dismissed' LIMIT 5",
    [userId, ids],
  );
}

export function restoreManualTags(db: Queryable, userId: string, id: string, tags: string[]) {
  return db.query(
    `INSERT INTO knowledge_tag(user_id,item_id,name,origin)
      SELECT $1,$2,tag,'manual' FROM unnest($3::text[]) AS tag ON CONFLICT DO NOTHING`,
    [userId, id, tags],
  );
}

export function selectIntegrationTags(db: Queryable, userId: string) {
  return db.query(
    `SELECT t.name,count(*)::int AS count FROM knowledge_tag t JOIN item i ON i.id=t.item_id AND i.user_id=t.user_id
    WHERE t.user_id=$1 AND t.origin<>'dismissed' AND NOT i.archived GROUP BY t.name ORDER BY t.name LIMIT 1000`,
    [userId],
  );
}

export function listItemTags(db: Queryable, itemId: string, userId: string) {
  return db.query<{ name: string }>(
    "SELECT name FROM knowledge_tag WHERE item_id=$1 AND user_id=$2 AND origin!='dismissed' ORDER BY name",
    [itemId, userId],
  );
}

export function readTagLimit(db: Queryable, itemId: string, userId: string, name: string) {
  return db.query<{ count: number; exists: boolean }>(
    `SELECT count(*)::integer AS count,COALESCE(bool_or(name=$3),false) AS exists
   FROM knowledge_tag WHERE item_id=$1 AND user_id=$2 AND origin<>'dismissed'`,
    [itemId, userId, name],
  );
}

export function upsertManualTag(db: Queryable, userId: string, itemId: string, name: string) {
  return db.query(
    `INSERT INTO knowledge_tag(user_id,item_id,name,origin)
    VALUES($1,$2,$3,'manual') ON CONFLICT(item_id,name) DO UPDATE SET origin='manual'`,
    [userId, itemId, name],
  );
}

export function dismissTagsNotIn(db: Queryable, itemId: string, userId: string, tags: string[]) {
  return db.query(
    "UPDATE knowledge_tag SET origin='dismissed' WHERE item_id=$1 AND user_id=$2 AND NOT(name=ANY($3::text[]))",
    [itemId, userId, tags],
  );
}

export function findExistingKnowledgeTags(
  db: Queryable,
  userId: string,
  itemId: string,
  tags: string[],
) {
  return db.query<{ name: string }>(
    "SELECT DISTINCT name FROM knowledge_tag WHERE user_id=$1 AND item_id<>$2 AND origin<>'dismissed' AND name=ANY($3::text[])",
    [userId, itemId, tags],
  );
}

export function addInferredKnowledgeTag(
  db: Queryable,
  userId: string,
  itemId: string,
  tag: string,
) {
  return db.query(
    "INSERT INTO knowledge_tag(user_id,item_id,name,origin) VALUES($1,$2,$3,'auto') ON CONFLICT DO NOTHING",
    [userId, itemId, tag],
  );
}
