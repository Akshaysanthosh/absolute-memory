import type { Queryable } from '@/server/db';
import type { LibraryOption } from '@/shared/library-options';

export async function listLibraryOptions(
  userId: string,
  db: Queryable,
  cursor: string | null = null,
) {
  const { rows } = await db.query<LibraryOption>(
    `SELECT i.id,i.title,i.status,i.archived,
 (SELECT m.kind FROM media_source m WHERE m.item_id=i.id AND m.user_id=i.user_id) AS media_kind,
 COALESCE((SELECT jsonb_agg(t.name ORDER BY t.name) FROM knowledge_tag t WHERE t.item_id=i.id AND t.user_id=i.user_id AND t.origin!='dismissed'),'[]'::jsonb) AS tags
 FROM item i WHERE i.user_id=$1 AND ($2::uuid IS NULL OR i.id>$2) ORDER BY i.id LIMIT 101`,
    [userId, cursor],
  );
  const items = rows.slice(0, 100);
  return { items, nextCursor: rows.length > 100 ? items.at(-1)!.id : null };
}
