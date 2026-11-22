import type { Queryable } from '@/server/db';

export function upsertWorkerHeartbeat(db: Queryable) {
  return db.query(`INSERT INTO worker_heartbeat(name,started_at,status,last_seen_at) VALUES('worker',now(),'running',now())
    ON CONFLICT(name) DO UPDATE SET status='running',last_seen_at=now()`);
}

export function findWorkerFreshness(db: Queryable) {
  return db.query<{ fresh: boolean }>(`SELECT last_seen_at>now()-interval '90 seconds' AS fresh
    FROM worker_heartbeat WHERE name='worker' AND status='running'`);
}
