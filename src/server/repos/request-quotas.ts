import type { Queryable } from '@/server/db';

export function deleteStaleRequestBuckets(db: Queryable) {
  return db.query("DELETE FROM request_bucket WHERE available_at < now()-interval '1 hour'");
}

export function consumeRequestBucket(db: Queryable, key: string, interval: number, burst: number) {
  return db.query(
    `INSERT INTO request_bucket(bucket, available_at)
      VALUES ($1, clock_timestamp() + $2::double precision * interval '1 millisecond')
      ON CONFLICT (bucket) DO UPDATE
        SET available_at = greatest(request_bucket.available_at, clock_timestamp()) + $2::double precision * interval '1 millisecond'
        WHERE request_bucket.available_at <= clock_timestamp() + $3::double precision * interval '1 millisecond'
      RETURNING bucket`,
    [key, interval, burst],
  );
}
