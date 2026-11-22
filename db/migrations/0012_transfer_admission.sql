ALTER TABLE transfer_job DROP CONSTRAINT transfer_job_state_check;
ALTER TABLE transfer_job ADD CONSTRAINT transfer_job_state_check
  CHECK (state IN ('uploading','queued','running','ready','failed','expired'));

WITH jobs AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id,kind ORDER BY (state='running') DESC,created_at,id
  ) AS priority FROM transfer_job WHERE state IN ('queued','running')
)
UPDATE transfer_job SET state='failed',input_key=NULL,lease=NULL,heartbeat_at=NULL,
  error='A transfer of this type was already in progress.'
WHERE id IN (SELECT id FROM jobs WHERE priority>1);

CREATE UNIQUE INDEX transfer_job_one_active_kind
  ON transfer_job(user_id,kind) WHERE state IN ('uploading','queued','running');
