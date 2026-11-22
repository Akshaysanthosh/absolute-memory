import type { Queryable } from '@/server/db';
type Job = {
  id: string;
  user_id: string;
  kind: 'import' | 'export';
  format: string | null;
  input_key: string | null;
  processed: number;
  attempts: number;
  lease: string;
};
export type { Job as TransferJob };

export function insertExportJob(db: Queryable, id: string, userId: string) {
  return db.query(
    `INSERT INTO transfer_job(id,user_id,kind) VALUES($1,$2,'export')
    ON CONFLICT DO NOTHING RETURNING id`,
    [id, userId],
  );
}

export function reserveImportUpload(
  db: Queryable,
  id: string,
  userId: string,
  format: string,
  inputKey: string,
) {
  return db.query(
    `INSERT INTO transfer_job(id,user_id,kind,format,input_key,state,available_at)
      VALUES($1,$2,'import',$3,$4,'uploading',now()+interval '10 minutes')
      ON CONFLICT DO NOTHING RETURNING id`,
    [id, userId, format, inputKey],
  );
}

export function queueUploadedImport(db: Queryable, id: string, userId: string) {
  return db.query(
    `UPDATE transfer_job SET state='queued',available_at=now()
        WHERE id=$1 AND user_id=$2 AND state='uploading' RETURNING id`,
    [id, userId],
  );
}

export function failImportUpload(db: Queryable, id: string, userId: string, error: string) {
  return db.query(
    `UPDATE transfer_job SET state='failed',input_key=NULL,error=$3
        WHERE id=$1 AND user_id=$2 AND state='uploading'`,
    [id, userId, error],
  );
}

export function findExportDownload(db: Queryable, id: string, userId: string) {
  return db.query<{ output_key: string | null }>(
    "SELECT output_key FROM transfer_job WHERE id=$1 AND user_id=$2 AND kind='export' AND state='ready'",
    [id, userId],
  );
}

export function markExportReady(
  db: Queryable,
  id: string,
  key: string,
  lease: string,
  userId: string,
) {
  return db.query(
    `UPDATE transfer_job SET state='ready',output_key=$2,processed=1,total=1,completed_at=now(),lease=NULL
      WHERE id=$1 AND lease=$3 AND user_id=$4 RETURNING id`,
    [id, key, lease, userId],
  );
}

export function lockTransferJob(db: Queryable, id: string, lease: string) {
  return db.query('SELECT id FROM transfer_job WHERE id=$1 AND lease=$2 FOR UPDATE', [id, lease]);
}

export function finishPortableImport(
  db: Queryable,
  id: string,
  lease: string,
  total: number,
  created: number,
  duplicates: number,
) {
  return db.query(
    `UPDATE transfer_job SET state='ready',input_key=NULL,processed=$3,total=$3,imported=$4,duplicates=$5,completed_at=now(),lease=NULL
            WHERE id=$1 AND lease=$2`,
    [id, lease, total, created, duplicates],
  );
}

export function recordImportProgress(
  db: Queryable,
  id: string,
  lease: string,
  state: 'queued' | 'ready',
  processed: number,
  total: number,
  created: number,
  duplicates: number,
  skipped: number,
) {
  return db.query(
    `UPDATE transfer_job SET state=$3,processed=$4,total=$5,imported=imported+$6,duplicates=duplicates+$7,skipped=$8,
          input_key=CASE WHEN $3='ready' THEN NULL ELSE input_key END,
          completed_at=CASE WHEN $3='ready' THEN now() ELSE NULL END,attempts=0,lease=NULL,heartbeat_at=NULL,available_at=now(),error=NULL
        WHERE id=$1 AND lease=$2`,
    [id, lease, state, processed, total, created, duplicates, skipped],
  );
}

export function expireImportUploads(db: Queryable) {
  return db.query(`UPDATE transfer_job SET state='failed',input_key=NULL,error='The file upload expired.'
      WHERE state='uploading' AND available_at <= now()`);
}

export function expireOldExports(db: Queryable) {
  return db.query(
    "UPDATE transfer_job SET state='expired',output_key=NULL WHERE state='ready' AND kind='export' AND completed_at<now()-interval '24 hours'",
  );
}

export function claimTransferJob(db: Queryable, lease: string, userId: string | null) {
  return db.query<Job>(
    `UPDATE transfer_job SET state='running',lease=$1,heartbeat_at=now(),attempts=attempts+1,error=NULL
      WHERE id=(SELECT id FROM transfer_job WHERE ($2::text IS NULL OR user_id=$2)
       AND ((state='queued' AND available_at<=now()) OR (state='running' AND heartbeat_at<now()-interval '5 minutes'))
       ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    [lease, userId],
  );
}

export function touchTransferJob(db: Queryable, id: string, lease: string) {
  return db.query('UPDATE transfer_job SET heartbeat_at=now() WHERE id=$1 AND lease=$2', [
    id,
    lease,
  ]);
}

export function failOrRetryTransfer(
  db: Queryable,
  id: string,
  lease: string,
  state: 'queued' | 'failed',
  error: string,
) {
  return db.query(
    `UPDATE transfer_job SET state=$3,error=$4,lease=NULL,heartbeat_at=NULL,available_at=now()+interval '15 seconds',
      input_key=CASE WHEN $3='failed' THEN NULL ELSE input_key END WHERE id=$1 AND lease=$2`,
    [id, lease, state, error],
  );
}

export function readTransferJobs(db: Queryable, userId: string) {
  return db.query(
    `SELECT id,kind,format,state,processed,total,imported,duplicates,skipped,error,created_at,completed_at
    FROM transfer_job WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [userId],
  );
}
