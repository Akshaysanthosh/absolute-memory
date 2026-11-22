CREATE TABLE transfer_job (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('export','import')),
 format text,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','ready','failed','expired')),
 input_key text UNIQUE,
 output_key text UNIQUE,
 lease uuid,
 heartbeat_at timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 processed integer NOT NULL DEFAULT 0,
 total integer,
 imported integer NOT NULL DEFAULT 0,
 duplicates integer NOT NULL DEFAULT 0,
 skipped integer NOT NULL DEFAULT 0,
 error text
);
CREATE INDEX transfer_job_claim ON transfer_job(state,available_at);
CREATE INDEX transfer_job_user ON transfer_job(user_id,created_at DESC);

CREATE FUNCTION queue_transfer_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.input_key IS NOT NULL AND (TG_OP='DELETE' OR NEW.input_key IS DISTINCT FROM OLD.input_key) THEN
  INSERT INTO document_asset_cleanup(object_key) VALUES(OLD.input_key) ON CONFLICT DO NOTHING;
 END IF;
 IF OLD.output_key IS NOT NULL AND (TG_OP='DELETE' OR NEW.output_key IS DISTINCT FROM OLD.output_key) THEN
  INSERT INTO document_asset_cleanup(object_key) VALUES(OLD.output_key) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END;
$$;
CREATE TRIGGER transfer_assets_removed AFTER DELETE OR UPDATE OF input_key,output_key ON transfer_job
 FOR EACH ROW EXECUTE FUNCTION queue_transfer_cleanup();
