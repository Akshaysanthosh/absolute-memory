ALTER TABLE knowledge_chunk ALTER COLUMN embedding TYPE vector USING embedding::vector;
ALTER TABLE knowledge_chunk ALTER COLUMN embedding_model DROP DEFAULT;
ALTER TABLE knowledge_chunk ALTER COLUMN embedding_model DROP NOT NULL;
ALTER TABLE knowledge_job DROP CONSTRAINT knowledge_job_state_check;
ALTER TABLE knowledge_job ADD CONSTRAINT knowledge_job_state_check
    CHECK (state IN ('queued', 'running', 'ready', 'failed', 'skipped'));
ALTER TABLE instance_setting ADD COLUMN embedding_invalid boolean NOT NULL DEFAULT false;
UPDATE instance_setting SET schema_version=3 WHERE singleton;
