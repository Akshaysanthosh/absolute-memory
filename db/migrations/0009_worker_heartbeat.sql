ALTER TABLE worker_heartbeat ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
