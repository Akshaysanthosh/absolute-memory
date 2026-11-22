import {
  insertExportJob,
  reserveImportUpload,
  queueUploadedImport,
  failImportUpload,
  findExportDownload,
  markExportReady,
  lockTransferJob,
  finishPortableImport,
  recordImportProgress,
  expireImportUploads,
  expireOldExports,
  claimTransferJob,
  touchTransferJob,
  failOrRetryTransfer,
  readTransferJobs,
  type TransferJob,
} from '@/server/repos/transfer-jobs';
import type { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { getDatabase, type Database, type Queryable } from '@/server/db';
import { HttpError, resourceId } from '@/server/auth/http';
import { getStorage } from '@/server/providers';
import { forgetStagedObject, trackStagedObject } from '@/server/repos/documents';
import { withTransferFile } from './archive';
import { limitedTransferStream, transferLimits } from './limits';
import { exportLibrary } from './export';
import {
  importFormatSchema,
  insertLegacyEntries,
  parseLegacyImport,
  type ImportFormat,
} from './legacy-import';
import { importPortableLibrary } from './portable-import';

const batchSize = 100;
function path(userId: string, id: string) {
  const owner = createHash('sha256').update(userId).digest('hex');
  return `transfers/${owner}/${id}`;
}

export async function queueExport(userId: string, db?: Queryable) {
  const id = randomUUID();
  const { rows } = await insertExportJob(db ?? (await getDatabase()), id, userId);
  if (!rows.length) throw new HttpError(409, 'An export is already in progress.');
  return id;
}

export async function queueImport(
  userId: string,
  format: ImportFormat,
  source: Readable,
  database?: Database,
  requestSignal?: AbortSignal,
) {
  const id = randomUUID();
  const input = `${path(userId, id)}/input`;
  const timeout = AbortSignal.timeout(8 * 60_000);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  try {
    const db = database ?? (await getDatabase());
    const { rows } = await reserveImportUpload(db, id, userId, format, input);
    if (!rows.length) throw new HttpError(409, 'An import is already in progress.');
    try {
      await getStorage().putStream(
        input,
        limitedTransferStream(source, transferLimits().uploadBytes, signal),
        'application/octet-stream',
        signal,
      );
      const queued = await queueUploadedImport(db, id, userId);
      if (!queued.rows.length)
        throw new HttpError(409, 'The upload reservation expired. Start a new import.');
    } catch (error) {
      await failImportUpload(
        db,
        id,
        userId,
        error instanceof HttpError ? error.message : 'The file upload did not complete.',
      );
      throw error;
    }
    return id;
  } finally {
    source.destroy();
  }
}

export async function listTransfers(userId: string, db?: Queryable) {
  return (await readTransferJobs(db ?? (await getDatabase()), userId)).rows;
}

export async function downloadTransfer(userId: string, id: string, db?: Queryable) {
  const job = (await findExportDownload(db ?? (await getDatabase()), resourceId(id), userId))
    .rows[0];
  if (!job?.output_key) throw new HttpError(404, 'This export is unavailable.');
  return getStorage().get(job.output_key);
}

async function completeExport(db: Database, job: TransferJob) {
  const key = `${path(job.user_id, job.id)}/${job.lease}.zip`;
  const stream = await exportLibrary(job.user_id, db);
  const signal = AbortSignal.timeout(8 * 60_000);
  await trackStagedObject(db, key);
  await getStorage().putStream(
    key,
    limitedTransferStream(stream, transferLimits().uploadBytes, signal),
    'application/zip',
    signal,
  );
  await db.transaction(async (tx) => {
    const result = await markExportReady(tx, job.id, key, job.lease, job.user_id);
    if (result.rows.length) await forgetStagedObject(tx, key);
  });
}

async function importBatch(db: Database, job: TransferJob) {
  if (!job.input_key) throw new HttpError(422, 'The upload is missing.');
  const format = importFormatSchema.safeParse(job.format);
  if (!format.success) throw new HttpError(422, 'Unsupported import format.');
  const upload = await getStorage().get(job.input_key);
  await withTransferFile(upload, async (file) => {
    if (format.data === 'absolute-memory') {
      await importPortableLibrary(job.user_id, file, db, {
        async lock(tx) {
          return Boolean((await lockTransferJob(tx, job.id, job.lease)).rows.length);
        },
        async complete(tx, result) {
          const total = result.created + result.duplicates;
          await finishPortableImport(
            tx,
            job.id,
            job.lease,
            total,
            result.created,
            result.duplicates,
          );
        },
      });
      return;
    }
    const source = await parseLegacyImport(format.data, file);
    const entries = source.entries.slice(job.processed, job.processed + batchSize);
    const processed = job.processed + entries.length;
    const complete = processed >= source.entries.length;
    await db.transaction(async (tx) => {
      const { rows } = await lockTransferJob(tx, job.id, job.lease);
      if (!rows.length) return;
      const result = await insertLegacyEntries(tx, job.user_id, entries);
      await recordImportProgress(
        tx,
        job.id,
        job.lease,
        complete ? 'ready' : 'queued',
        processed,
        source.entries.length,
        result.created,
        result.duplicates,
        source.skipped,
      );
    });
  });
}

export async function processTransfer(db: Database, userId?: string) {
  const job = await db.transaction(async (tx) => {
    await expireImportUploads(tx);
    await expireOldExports(tx);
    const result = await claimTransferJob(tx, randomUUID(), userId ?? null);
    return result.rows[0];
  });
  if (!job) return false;
  const interval = setInterval(() => {
    void touchTransferJob(db, job.id, job.lease).catch(() => {});
  }, 30_000);
  interval.unref();
  try {
    if (job.attempts > 3)
      throw new HttpError(
        409,
        'The transfer stopped after repeated interruptions. Start a new transfer to try again.',
      );
    if (job.kind === 'import') await importBatch(db, job);
    else await completeExport(db, job);
  } catch (error) {
    const retry = !(error instanceof HttpError) && job.attempts < 3;
    const message =
      error instanceof HttpError
        ? error.message
        : retry
          ? 'The transfer will retry shortly.'
          : 'The transfer could not finish. Start a new transfer to try again.';
    await failOrRetryTransfer(db, job.id, job.lease, retry ? 'queued' : 'failed', message);
  } finally {
    clearInterval(interval);
  }
  return true;
}

export async function processAccountTransfer(userId: string) {
  return processTransfer(await getDatabase(), userId);
}
