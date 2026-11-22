import type { Queryable } from '@/server/db';
import type { Item } from '@/shared/types';

export function findQuoteByKey(db: Queryable, userId: string, key: string) {
  return db.query<Item>('SELECT * FROM item WHERE user_id=$1 AND quote_key=$2', [userId, key]);
}

export function insertQuote(
  db: Queryable,
  input: {
    id: string;
    userId: string;
    title: string;
    domain: string;
    excerpt: string;
    passagesJson: string;
    words: number;
    channel: string;
    detailsJson: string;
    key: string;
    html: string;
  },
) {
  const {
    id,
    userId,
    title,
    domain,
    excerpt,
    passagesJson,
    words,
    channel,
    detailsJson,
    key,
    html,
  } = input;
  return db.query<Item>(
    `INSERT INTO item(id,user_id,kind,title,domain,excerpt,passages,words,channel,source_details,quote_key,reading_html)
        VALUES($1,$2,'note',$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11) RETURNING *`,
    [id, userId, title, domain, excerpt, passagesJson, words, channel, detailsJson, key, html],
  );
}

export function writeSocialSnapshot(
  db: Queryable,
  input: {
    id: string;
    title: string;
    author: string | null;
    excerpt: string;
    passagesJson: string;
    words: number;
    detailsJson: string;
    hasVideo: boolean;
    userId: string;
    html: string;
  },
) {
  const { id, title, author, excerpt, passagesJson, words, detailsJson, hasVideo, userId, html } =
    input;
  return db.query(
    `UPDATE item SET title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE $2 END,
        author=$3,excerpt=$4,passages=$5::jsonb,reading_html=$10,words=$6,source_details=COALESCE(source_details,'{}'::jsonb)||$7::jsonb,
        bookmark_type=CASE WHEN $8 THEN NULL ELSE 'website' END, status=CASE WHEN $8 THEN 'pending' ELSE 'ready' END,error=NULL,updated_at=now()
        WHERE id=$1 AND user_id=$9`,
    [id, title, author, excerpt, passagesJson, words, detailsJson, hasVideo, userId, html],
  );
}

export function findCaptureFromTurn(db: Queryable, userId: string, turnId: string) {
  return db.query<Item & Record<string, unknown>>(
    'SELECT * FROM item WHERE user_id=$1 AND origin_turn_id=$2',
    [userId, turnId],
  );
}

export function findCaptureByUrl(db: Queryable, userId: string, url: string) {
  return db.query<Item & Record<string, unknown>>(
    'SELECT * FROM item WHERE user_id = $1 AND url = $2',
    [userId, url],
  );
}

export function adoptSampleItem(db: Queryable, id: string, userId: string, channel: string) {
  return db.query<Item>(
    'UPDATE item SET sample_key=NULL,channel=$3,created_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, userId, channel],
  );
}

export function refreshSocialSnapshot(
  db: Queryable,
  input: {
    id: string;
    userId: string;
    title: string;
    author: string | null;
    detailsJson: string;
    replaceReading: boolean;
    passagesJson: string;
    excerpt: string;
    words: number;
    html: string;
  },
) {
  const {
    id,
    userId,
    title,
    author,
    detailsJson,
    replaceReading,
    passagesJson,
    excerpt,
    words,
    html,
  } = input;
  return db.query(
    `UPDATE item SET title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE $3 END,
          author=$4,source_details=$5::jsonb,passages=CASE WHEN $6 THEN $7::jsonb ELSE passages END,
          reading_html=CASE WHEN $6 THEN $10 ELSE reading_html END,
          excerpt=CASE WHEN $6 THEN $8 ELSE excerpt END,words=CASE WHEN $6 THEN $9 ELSE words END,updated_at=now()
          WHERE id=$1 AND user_id=$2`,
    [id, userId, title, author, detailsJson, replaceReading, passagesJson, excerpt, words, html],
  );
}

export function mergeCaptureDetails(
  db: Queryable,
  id: string,
  userId: string,
  detailsJson: string,
) {
  return db.query(
    "UPDATE item SET source_details=COALESCE(source_details,'{}'::jsonb)||$3::jsonb WHERE id=$1 AND user_id=$2",
    [id, userId, detailsJson],
  );
}

export function repairBrowserCapture(
  db: Queryable,
  input: {
    id: string;
    title: string;
    author: string | null;
    excerpt: string;
    passagesJson: string;
    words: number;
    bookmarkType: 'website' | 'product' | null;
    detailsJson: string;
    html: string;
    sourceName: string | null;
    publishedAt: string | null;
  },
) {
  const {
    id,
    title,
    author,
    excerpt,
    passagesJson,
    words,
    bookmarkType,
    detailsJson,
    html,
    sourceName,
    publishedAt,
  } = input;
  return db.query<Item & Record<string, unknown>>(
    "UPDATE item SET title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE $2 END,author=$3,excerpt=$4,passages=$5::jsonb,reading_html=$9,source_name=$10,published_at=$11,words=$6,bookmark_type=$7,source_details=COALESCE(NULLIF($8::jsonb,'null'::jsonb),'{}'::jsonb)||CASE WHEN source_details->>'titleEdited'='true' THEN '{\"titleEdited\":true}'::jsonb ELSE '{}'::jsonb END,status='ready',error=NULL,updated_at=now() WHERE id=$1 RETURNING *",
    [
      id,
      title,
      author,
      excerpt,
      passagesJson,
      words,
      bookmarkType,
      detailsJson,
      html,
      sourceName,
      publishedAt,
    ],
  );
}

export function insertCapture(
  db: Queryable,
  input: {
    id: string;
    userId: string;
    kind: 'article' | 'note';
    title: string;
    url: string | null;
    domain: string | null;
    excerpt: string;
    passagesJson: string;
    words: number;
    status: 'pending' | 'ready';
    channel: string;
    turnId: string | null;
    html: string;
  },
) {
  const {
    id,
    userId,
    kind,
    title,
    url,
    domain,
    excerpt,
    passagesJson,
    words,
    status,
    channel,
    turnId,
    html,
  } = input;
  return db.query<Item & Record<string, unknown>>(
    `INSERT INTO item(id,user_id,kind,title,url,domain,excerpt,passages,words,status,channel,origin_turn_id,reading_html)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13) RETURNING *`,
    [
      id,
      userId,
      kind,
      title,
      url,
      domain,
      excerpt,
      passagesJson,
      words,
      status,
      channel,
      turnId,
      html,
    ],
  );
}

export function finishBrowserCapture(
  db: Queryable,
  input: {
    id: string;
    title: string;
    author: string | null;
    excerpt: string;
    passagesJson: string;
    words: number;
    bookmarkType: 'website' | 'product' | null;
    detailsJson: string;
    html: string;
    sourceName: string | null;
    publishedAt: string | null;
  },
) {
  const {
    id,
    title,
    author,
    excerpt,
    passagesJson,
    words,
    bookmarkType,
    detailsJson,
    html,
    sourceName,
    publishedAt,
  } = input;
  return db.query<Item & Record<string, unknown>>(
    "UPDATE item SET title=CASE WHEN source_details->>'titleEdited'='true' THEN title ELSE $2 END,author=$3,excerpt=$4,passages=$5::jsonb,reading_html=$9,source_name=$10,published_at=$11,words=$6,bookmark_type=$7,source_details=COALESCE(NULLIF($8::jsonb,'null'::jsonb),'{}'::jsonb)||CASE WHEN source_details->>'titleEdited'='true' THEN '{\"titleEdited\":true}'::jsonb ELSE '{}'::jsonb END,status='ready',updated_at=now() WHERE id=$1 RETURNING *",
    [
      id,
      title,
      author,
      excerpt,
      passagesJson,
      words,
      bookmarkType,
      detailsJson,
      html,
      sourceName,
      publishedAt,
    ],
  );
}

export function setCaptureSocialPlatform(db: Queryable, id: string, platform: string) {
  return db.query(
    "UPDATE item SET source_details=COALESCE(source_details,'{}'::jsonb)||jsonb_build_object('social',COALESCE(source_details->'social','{}'::jsonb)||jsonb_build_object('platform',$2::text)) WHERE id=$1",
    [id, platform],
  );
}

export function setRetrySocialPlatform(
  db: Queryable,
  id: string,
  userId: string,
  platform: string,
) {
  return db.query(
    "UPDATE item SET source_details=COALESCE(source_details,'{}'::jsonb)||jsonb_build_object('social',jsonb_build_object('platform',$3::text)) WHERE id=$1 AND user_id=$2",
    [id, userId, platform],
  );
}
