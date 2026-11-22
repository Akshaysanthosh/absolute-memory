import type { Queryable } from '@/server/db';

export type MediaWorkSource = {
  kind: 'podcast' | 'audio' | 'youtube' | 'social';
  user_id: string;
  transcript_url: string | null;
  url: string | null;
  audio_url: string | null;
  audio_object_key: string | null;
  description: string | null;
  duration_seconds: number | null;
  source_language: string | null;
  has_snapshot: boolean;
};

export function findItemMediaStage(db: Queryable, id: string, userId: string) {
  return db.query<{ stage: string }>(
    'SELECT stage FROM media_source WHERE item_id=$1 AND user_id=$2',
    [id, userId],
  );
}

export function ensureSocialMediaSource(db: Queryable, id: string, userId: string) {
  return db.query(
    "INSERT INTO media_source(item_id,user_id,kind) VALUES($1,$2,'social') ON CONFLICT(item_id) DO NOTHING",
    [id, userId],
  );
}

export function deleteMediaSource(db: Queryable, id: string, userId: string) {
  return db.query('DELETE FROM media_source WHERE item_id=$1 AND user_id=$2', [id, userId]);
}

export function insertSocialMediaSource(db: Queryable, id: string, userId: string) {
  return db.query("INSERT INTO media_source(item_id,user_id,kind) VALUES($1,$2,'social')", [
    id,
    userId,
  ]);
}

export function insertYouTubeSource(db: Queryable, id: string, userId: string) {
  return db.query("INSERT INTO media_source(item_id,user_id,kind) VALUES($1,$2,'youtube')", [
    id,
    userId,
  ]);
}

export function findItemMedia(db: Queryable, id: string, userId: string) {
  return db.query('SELECT item_id FROM media_source WHERE item_id=$1 AND user_id=$2', [id, userId]);
}

export function findMediaFingerprint(db: Queryable, userId: string, fingerprint: string) {
  return db.query<{ item_id: string }>(
    'SELECT item_id FROM media_source WHERE user_id=$1 AND fingerprint=$2',
    [userId, fingerprint],
  );
}

export function ensureYouTubeSource(db: Queryable, id: string) {
  return db.query(
    "INSERT INTO media_source(item_id,user_id,kind) SELECT id,user_id,'youtube' FROM item WHERE id=$1 ON CONFLICT(item_id) DO NOTHING",
    [id],
  );
}

export function deleteUnscopedMediaSource(db: Queryable, id: string) {
  return db.query('DELETE FROM media_source WHERE item_id=$1', [id]);
}

export function readMediaWork(db: Queryable, id: string) {
  return db.query<MediaWorkSource>(
    `SELECT m.kind,m.user_id,m.transcript_url,m.audio_url,m.audio_object_key,m.duration_seconds,i.url,
            i.source_details#>>'{source,description}' AS description,
            i.source_details#>>'{source,language}' AS source_language,
            i.source_details#>'{social,post}' IS NOT NULL AS has_snapshot
     FROM media_source m JOIN item i ON i.id=m.item_id AND i.user_id=m.user_id WHERE m.item_id=$1`,
    [id],
  );
}

export function saveTimedMediaSegments(
  db: Queryable,
  id: string,
  userId: string,
  segmentsJson: string,
  language: string | null,
  warning: string | null,
  duration: number | null,
) {
  return db.query(
    `UPDATE media_source SET stage='complete',segments=$3::jsonb,language=$4,warning=$5,
          duration_seconds=COALESCE($6,duration_seconds),audio_object_key=NULL,
          fingerprint=CASE WHEN kind='audio' AND $5::text IS NOT NULL THEN NULL ELSE fingerprint END
       WHERE item_id=$1 AND user_id=$2`,
    [id, userId, segmentsJson, language, warning, duration],
  );
}

export function insertUploadedMediaSource(
  db: Queryable,
  id: string,
  userId: string,
  fingerprint: string,
  key: string,
) {
  return db.query(
    "INSERT INTO media_source(item_id,user_id,kind,stage,fingerprint,audio_object_key) VALUES($1,$2,'audio','native',$3,$4)",
    [id, userId, fingerprint, key],
  );
}

export function insertPodcastMediaSource(
  db: Queryable,
  id: string,
  userId: string,
  audioUrl: string | null,
  transcriptUrl: string | null,
  duration: number | null,
  fingerprint: string,
) {
  return db.query(
    "INSERT INTO media_source(item_id,user_id,kind,stage,audio_url,transcript_url,duration_seconds,fingerprint) VALUES($1,$2,'podcast','native',$3,$4,$5,$6)",
    [id, userId, audioUrl, transcriptUrl, duration, fingerprint],
  );
}
