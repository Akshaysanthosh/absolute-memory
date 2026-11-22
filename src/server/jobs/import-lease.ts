import { touchImportLease } from '@/server/repos/import-jobs';
import type { Queryable } from '@/server/db';

/** Keeps a running import's claim fresh while a slow provider call is in flight, so the
 * two-minute stale-claim rule cannot hand the same job to a second worker. */
export async function withImportHeartbeat<T>(
  db: Queryable,
  jobId: string,
  lockToken: string,
  fn: () => Promise<T>,
  everyMs = 45_000,
): Promise<T> {
  const timer = setInterval(() => {
    touchImportLease(db, jobId, lockToken).catch(() => {});
  }, everyMs);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}
