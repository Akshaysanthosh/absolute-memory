CREATE TABLE IF NOT EXISTS request_bucket (
  bucket text PRIMARY KEY,
  available_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS request_bucket_expiry ON request_bucket(available_at);
