CREATE TABLE instance_invite (
    id uuid PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    created_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    used_by text REFERENCES "user"(id) ON DELETE SET NULL
);

CREATE INDEX instance_invite_expiry ON instance_invite(expires_at);
UPDATE instance_setting SET schema_version=2 WHERE singleton;
