import type { Queryable } from '@/server/db';

type Job = { id: string; item_id: string; attempts: number; lock_token: string } & Record<
  string,
  unknown
>;

export function requeueImport(db: Queryable, jobId: string, itemId: string) {
  return db.query(
    "INSERT INTO import_job(id,item_id) VALUES($1,$2) ON CONFLICT(item_id) DO UPDATE SET state='queued',attempts=0,lock_token=NULL,available_at=now(),error=NULL",
    [jobId, itemId],
  );
}

export function completeImportForItem(db: Queryable, id: string) {
  return db.query("UPDATE import_job SET state='done',lock_token=NULL WHERE item_id=$1", [id]);
}

export function finishImportForItem(db: Queryable, id: string) {
  return db.query(
    "UPDATE import_job SET state='done',lock_token=NULL,error=NULL WHERE item_id=$1",
    [id],
  );
}

export function enqueueImport(db: Queryable, jobId: string, itemId: string) {
  return db.query('INSERT INTO import_job(id,item_id) VALUES ($1,$2)', [jobId, itemId]);
}

export function lockItemImport(db: Queryable, id: string, userId: string) {
  return db.query(
    `SELECT j.id FROM import_job j JOIN item i ON i.id=j.item_id
    WHERE i.id=$1 AND i.user_id=$2 FOR UPDATE OF j`,
    [id, userId],
  );
}

export function retryFailedImport(db: Queryable, id: string) {
  return db.query(
    "UPDATE import_job SET state='queued',attempts=0,available_at=now(),error=NULL WHERE item_id=$1 AND state='failed'",
    [id],
  );
}

export function restoreImportJob(
  db: Queryable,
  id: string,
  itemId: string,
  state: 'queued' | 'failed',
  error: string | null,
) {
  return db.query('INSERT INTO import_job(id,item_id,state,error) VALUES($1,$2,$3,$4)', [
    id,
    itemId,
    state,
    error,
  ]);
}

export function claimNextImport(db: Queryable, lockToken: string, userId: string | null) {
  return db.query<Job>(
    `UPDATE import_job SET state='running', locked_at=now(), lock_token=$1, attempts=attempts+1
      WHERE id=(SELECT j.id FROM import_job j JOIN item i ON i.id=j.item_id WHERE ($2::text IS NULL OR i.user_id=$2) AND ((j.state='queued' AND j.available_at<=now()) OR (j.state='running' AND j.locked_at<now()-interval '2 minutes'))
      ORDER BY j.available_at FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING *`,
    [lockToken, userId],
  );
}

export function completeImportLease(db: Queryable, id: string, lockToken: string) {
  return db.query(
    "UPDATE import_job SET state='done', error=NULL, lock_token=NULL WHERE id=$1 AND lock_token=$2 RETURNING id",
    [id, lockToken],
  );
}

export function retryOrFailImportLease(
  db: Queryable,
  id: string,
  lockToken: string,
  state: 'queued' | 'failed',
  error: string,
  delaySeconds: number,
) {
  return db.query(
    'UPDATE import_job SET state=$3,error=$4,available_at=now()+make_interval(secs=>$5) WHERE id=$1 AND lock_token=$2 RETURNING id',
    [id, lockToken, state, error, delaySeconds],
  );
}

export function completeSocialFallbackJob(db: Queryable, id: string) {
  return db.query("UPDATE import_job SET state='done',lock_token=NULL WHERE id=$1", [id]);
}

export function touchImportLease(db: Queryable, id: string, lockToken: string) {
  return db.query(
    "UPDATE import_job SET locked_at=now() WHERE id=$1 AND lock_token=$2 AND state='running'",
    [id, lockToken],
  );
}

export function completeMediaImportLease(db: Queryable, id: string, lockToken: string) {
  return db.query(
    `UPDATE import_job SET state='done',error=NULL,lock_token=NULL
        WHERE id=$1 AND lock_token=$2 AND state='running' RETURNING id`,
    [id, lockToken],
  );
}

export function supersedePodcastImport(db: Queryable, id: string) {
  return db.query(
    "UPDATE import_job SET state='queued',attempts=0,available_at=now(),locked_at=NULL,lock_token=NULL,error=NULL WHERE item_id=$1",
    [id],
  );
}

export function queuePodcastImport(db: Queryable, jobId: string, itemId: string) {
  return db.query(
    "INSERT INTO import_job(id,item_id) VALUES($1,$2) ON CONFLICT(item_id) DO UPDATE SET state='queued',attempts=0,available_at=now(),locked_at=NULL,lock_token=NULL,error=NULL",
    [jobId, itemId],
  );
}
