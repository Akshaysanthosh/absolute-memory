import type { Queryable } from '@/server/db';
/** Return one digest, never article bodies, embeddings, file bytes or per-item IDs. */
export async function libraryRevision(userId: string, db: Queryable) {
  const { rows } = await db.query<{ revision: string }>(
    `SELECT md5(COALESCE(string_agg(
  jsonb_build_array(i.id,i.updated_at,i.status,j.state,j.summary IS DISTINCT FROM '',
   (SELECT string_agg(t.name||':'||t.origin,',' ORDER BY t.name) FROM knowledge_tag t WHERE t.item_id=i.id AND t.user_id=i.user_id))::text,
  '|' ORDER BY i.id),'')) AS revision
  FROM item i LEFT JOIN knowledge_job j ON j.item_id=i.id AND j.user_id=i.user_id WHERE i.user_id=$1`,
    [userId],
  );
  return rows[0].revision;
}
