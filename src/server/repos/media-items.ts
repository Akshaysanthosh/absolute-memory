import type { Queryable } from '@/server/db';

export function finishUnavailableSocialTranscript(db: Queryable, id: string, error: string) {
  return db.query(
    "UPDATE item SET status='ready',bookmark_type='website',error=NULL,source_details=jsonb_set(source_details,'{social,transcriptError}',to_jsonb($2::text)),updated_at=now() WHERE id=$1",
    [id, error],
  );
}

export function finishSocialMediaFallback(
  db: Queryable,
  id: string,
  userId: string,
  title: string | null,
  author: string | null,
  passagesJson: string,
  words: number,
  excerpt: string,
  warning: string | null,
  html: string,
) {
  return db.query(
    `UPDATE item SET status='ready',error=NULL,
        title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE COALESCE($3,title) END,
        author=COALESCE($4,author),passages=CASE WHEN $6>0 AND words=0 THEN $5::jsonb ELSE passages END,
        reading_html=CASE WHEN $6>0 AND words=0 THEN $9 ELSE reading_html END,
        bookmark_type=CASE WHEN words>0 OR $6>0 THEN NULL ELSE 'website' END,
        words=CASE WHEN words=0 THEN $6 ELSE words END,excerpt=CASE WHEN words=0 THEN $7 ELSE excerpt END,
        source_details=jsonb_set(jsonb_set(source_details,'{social,transcriptUnavailable}','true'::jsonb),'{social,transcriptError}',to_jsonb($8::text)),updated_at=now()
        WHERE id=$1 AND user_id=$2`,
    [id, userId, title, author, passagesJson, words, excerpt, warning, html],
  );
}

export function finishTimedMediaItem(
  db: Queryable,
  id: string,
  userId: string,
  passagesJson: string,
  words: number,
  excerpt: string,
  title: string | null,
  author: string | null,
  description: string | null,
  html: string,
) {
  return db.query(
    `UPDATE item SET passages=$3::jsonb,reading_html=$9,reader_position=NULL,words=$4,excerpt=$5,status='ready',error=NULL,updated_at=now(),
      title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE COALESCE($6,title) END,author=COALESCE($7,author),
      source_details=CASE WHEN $8::text IS NULL THEN source_details ELSE jsonb_set(source_details,'{source}',
        COALESCE(source_details->'source','{}'::jsonb)||jsonb_build_object('description',$8::text)) END
      WHERE id=$1 AND user_id=$2`,
    [id, userId, passagesJson, words, excerpt, title, author, description, html],
  );
}

export function insertUploadedMediaItem(db: Queryable, id: string, userId: string, title: string) {
  return db.query(
    "INSERT INTO item(id,user_id,kind,title,domain,status) VALUES($1,$2,'article',$3,'Audio upload','pending')",
    [id, userId, title],
  );
}

export function findConvertedPodcastUrl(db: Queryable, userId: string, url: string) {
  return db.query<{ id: string; status: string; has_media: boolean }>(
    'SELECT id,status,EXISTS(SELECT 1 FROM media_source m WHERE m.item_id=item.id) AS has_media FROM item WHERE user_id=$1 AND url=$2',
    [userId, url],
  );
}

export function convertExistingItemToPodcast(
  db: Queryable,
  id: string,
  userId: string,
  title: string,
  author: string | null,
) {
  return db.query(
    "UPDATE item SET title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE $3 END,domain='Podcast',author=$4,status='pending',error=NULL,passages='[]'::jsonb,reading_html='',reader_position=NULL,excerpt='',words=0,updated_at=now() WHERE id=$1 AND user_id=$2",
    [id, userId, title, author],
  );
}

export function insertPodcastItem(
  db: Queryable,
  id: string,
  userId: string,
  title: string,
  domain: string,
  author: string | null,
  channel: string,
  url: string | null,
) {
  return db.query(
    "INSERT INTO item(id,user_id,kind,title,url,domain,status,channel,author) VALUES($1,$2,'article',$3,$7,$4,'pending',$6,$5)",
    [id, userId, title, domain, author, channel, url],
  );
}

export function storePodcastDescription(
  db: Queryable,
  id: string,
  userId: string,
  description: string | null,
) {
  return db.query(
    "UPDATE item SET source_details=jsonb_set(COALESCE(source_details,'{}'::jsonb),'{source}',jsonb_build_object('description',$3::text)) WHERE id=$1 AND user_id=$2",
    [id, userId, description],
  );
}
