import type { Queryable } from '@/server/db';

// Used only by the documentation demo scripts in scripts/demo-*.ts.

export function insertDemoYouTubeItem(
  db: Queryable,
  id: string,
  userId: string,
  url: string,
  title: string,
  channel: string,
) {
  return db.query(
    "INSERT INTO item(id,user_id,kind,url,title,domain,author,source_name,status) VALUES($1,$2,'article',$3,$4,'youtube.com',$5,$5,'pending')",
    [id, userId, url, title, channel],
  );
}

export function setDemoThumbnail(db: Queryable, id: string, userId: string, url: string) {
  return db.query(
    `UPDATE item SET source_details=jsonb_set(COALESCE(source_details,'{}'::jsonb),'{thumbnailUrl}',to_jsonb($3::text))
      WHERE id=$1 AND user_id=$2`,
    [id, userId, url],
  );
}

export function backdateDemoItem(db: Queryable, id: string, userId: string, hours: number) {
  return db.query(
    'UPDATE item SET created_at=now()-make_interval(hours=>$3) WHERE id=$1 AND user_id=$2',
    [id, userId, hours],
  );
}
