CREATE TABLE media_source (
    item_id uuid NOT NULL,
    user_id text NOT NULL,
    kind text NOT NULL,
    stage text DEFAULT 'metadata'::text NOT NULL,
    duration_seconds real,
    language text,
    generated boolean DEFAULT false NOT NULL,
    segments jsonb DEFAULT '[]'::jsonb NOT NULL,
    audio_url text,
    transcript_url text,
    fingerprint text,
    warning text,
    CONSTRAINT media_source_kind_check CHECK ((kind = ANY (ARRAY['youtube'::text, 'podcast'::text, 'audio'::text, 'social'::text]))),
    CONSTRAINT media_source_stage_check CHECK ((stage = ANY (ARRAY['metadata'::text, 'native'::text, 'complete'::text])))
);

CREATE TABLE note_document (
    item_id uuid NOT NULL,
    document jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE note_revision (
    item_id uuid NOT NULL,
    version integer NOT NULL,
    title text NOT NULL,
    document jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE onboarding_profile (
    user_id text NOT NULL,
    persona text,
    interests text[] DEFAULT '{}'::text[] NOT NULL,
    extension_step text,
    setup_completed_at timestamp with time zone,
    checklist_dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT onboarding_profile_extension_step_check CHECK ((extension_step = ANY (ARRAY['installed'::text, 'skipped'::text, 'not-offered'::text]))),
    CONSTRAINT onboarding_profile_persona_check CHECK ((persona = ANY (ARRAY[
      'studying'::text, 'research'::text, 'building'::text,
       'creating'::text, 'curious'::text])))
);

CREATE TABLE sample_seed (
    user_id text NOT NULL,
    keys text[] DEFAULT '{}'::text[] NOT NULL,
    seeded_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_at timestamp with time zone
);

CREATE TABLE session (
    id text NOT NULL,
    token text NOT NULL,
    user_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE source_file (
    item_id uuid NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    mime text NOT NULL,
    object_key text NOT NULL UNIQUE,
    size integer NOT NULL,
    pages integer DEFAULT 1 NOT NULL,
    method text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT source_file_size_check CHECK (size > 0)
);

CREATE TABLE topic_page (
    user_id text NOT NULL,
    topic text NOT NULL,
    overview text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE worker_heartbeat (
    name text NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    status text NOT NULL
);

ALTER TABLE ONLY account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);

ALTER TABLE ONLY account
    ADD CONSTRAINT account_provider_id_account_id_key UNIQUE (provider_id, account_id);

ALTER TABLE ONLY auth_rate_limit
    ADD CONSTRAINT auth_rate_limit_key_key UNIQUE (key);

ALTER TABLE ONLY auth_rate_limit
    ADD CONSTRAINT auth_rate_limit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY capture_receipt
    ADD CONSTRAINT capture_receipt_pkey PRIMARY KEY (hash);

ALTER TABLE ONLY capture_token
    ADD CONSTRAINT capture_token_pkey PRIMARY KEY (id);

ALTER TABLE ONLY capture_token
    ADD CONSTRAINT capture_token_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY document_asset_cleanup
    ADD CONSTRAINT document_asset_cleanup_pkey PRIMARY KEY (object_key);

ALTER TABLE ONLY document_asset
    ADD CONSTRAINT document_asset_object_key_key UNIQUE (object_key);

ALTER TABLE ONLY document_asset
    ADD CONSTRAINT document_asset_pkey PRIMARY KEY (item_id, variant);

ALTER TABLE ONLY extension_pair
    ADD CONSTRAINT extension_pair_pkey PRIMARY KEY (challenge);

ALTER TABLE ONLY import_job
    ADD CONSTRAINT import_job_item_id_key UNIQUE (item_id);

ALTER TABLE ONLY import_job
    ADD CONSTRAINT import_job_pkey PRIMARY KEY (id);

ALTER TABLE ONLY integration_save
    ADD CONSTRAINT integration_save_pkey PRIMARY KEY (token_id, item_id);

ALTER TABLE ONLY integration_save
    ADD CONSTRAINT integration_save_token_id_request_hash_key UNIQUE (token_id, request_hash);

ALTER TABLE ONLY integration_token
    ADD CONSTRAINT integration_token_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE ONLY integration_token
    ADD CONSTRAINT integration_token_pkey PRIMARY KEY (id);

ALTER TABLE ONLY integration_token
    ADD CONSTRAINT integration_token_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY item
    ADD CONSTRAINT item_owner_unique UNIQUE (id, user_id);

ALTER TABLE ONLY item
    ADD CONSTRAINT item_pkey PRIMARY KEY (id);

ALTER TABLE ONLY item_source_raw
    ADD CONSTRAINT item_source_raw_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY item
    ADD CONSTRAINT item_user_id_url_key UNIQUE (user_id, url);

ALTER TABLE ONLY knowledge_chunk
    ADD CONSTRAINT knowledge_chunk_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE ONLY knowledge_chunk
    ADD CONSTRAINT knowledge_chunk_item_id_ordinal_key UNIQUE (item_id, ordinal);

ALTER TABLE ONLY knowledge_chunk
    ADD CONSTRAINT knowledge_chunk_pkey PRIMARY KEY (id);

ALTER TABLE ONLY knowledge_edge
    ADD CONSTRAINT knowledge_edge_pkey PRIMARY KEY (id);

ALTER TABLE ONLY knowledge_edge
    ADD CONSTRAINT knowledge_edge_source_id_target_id_chunk_id_label_key UNIQUE (source_id, target_id, chunk_id, label);

ALTER TABLE ONLY knowledge_entity
    ADD CONSTRAINT knowledge_entity_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE ONLY knowledge_entity
    ADD CONSTRAINT knowledge_entity_pkey PRIMARY KEY (id);

ALTER TABLE ONLY knowledge_entity
    ADD CONSTRAINT knowledge_entity_user_id_name_type_key UNIQUE (user_id, name, type);

ALTER TABLE ONLY knowledge_job
    ADD CONSTRAINT knowledge_job_item_id_user_id_key UNIQUE (item_id, user_id);

ALTER TABLE ONLY knowledge_job
    ADD CONSTRAINT knowledge_job_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY knowledge_mention
    ADD CONSTRAINT knowledge_mention_pkey PRIMARY KEY (entity_id, chunk_id);

ALTER TABLE ONLY knowledge_tag
    ADD CONSTRAINT knowledge_tag_pkey PRIMARY KEY (item_id, name);

ALTER TABLE ONLY knowledge_usage
    ADD CONSTRAINT knowledge_usage_pkey PRIMARY KEY (id);

ALTER TABLE ONLY library_thread
    ADD CONSTRAINT library_thread_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE ONLY library_thread
    ADD CONSTRAINT library_thread_pkey PRIMARY KEY (id);

ALTER TABLE ONLY library_turn
    ADD CONSTRAINT library_turn_pkey PRIMARY KEY (id);

ALTER TABLE ONLY library_turn
    ADD CONSTRAINT library_turn_user_id_request_id_key UNIQUE (user_id, request_id);

ALTER TABLE ONLY media_source
    ADD CONSTRAINT media_source_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY note_document
    ADD CONSTRAINT note_document_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY note_revision
    ADD CONSTRAINT note_revision_pkey PRIMARY KEY (item_id, version);

ALTER TABLE ONLY onboarding_profile
    ADD CONSTRAINT onboarding_profile_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY sample_seed
    ADD CONSTRAINT sample_seed_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);

ALTER TABLE ONLY session
    ADD CONSTRAINT session_token_key UNIQUE (token);

ALTER TABLE ONLY source_file
    ADD CONSTRAINT source_file_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY topic_page
    ADD CONSTRAINT topic_page_pkey PRIMARY KEY (user_id, topic);

ALTER TABLE ONLY "user"
    ADD CONSTRAINT user_email_key UNIQUE (email);

ALTER TABLE ONLY "user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);

ALTER TABLE ONLY verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);

ALTER TABLE ONLY worker_heartbeat
    ADD CONSTRAINT worker_heartbeat_pkey PRIMARY KEY (name);

CREATE INDEX auth_rate_limit_time_idx ON auth_rate_limit USING btree (last_request);

CREATE INDEX capture_receipt_expiry ON capture_receipt USING btree (expires_at);

CREATE INDEX document_asset_cleanup_due ON document_asset_cleanup USING btree (available_at);

CREATE INDEX highlight_user_item_idx ON highlight USING btree (user_id, item_id);

CREATE INDEX integration_token_owner ON integration_token USING btree (user_id);

CREATE UNIQUE INDEX item_chat_note_origin ON item USING btree (user_id, origin_turn_id) WHERE (origin_turn_id IS NOT NULL);


CREATE UNIQUE INDEX item_owner_quote_key ON item USING btree (user_id, quote_key) WHERE (quote_key IS NOT NULL);

CREATE INDEX item_sample_idx ON item USING btree (user_id) WHERE (sample_key IS NOT NULL);

CREATE INDEX item_source_raw_user_idx ON item_source_raw USING btree (user_id);

CREATE INDEX item_user_date_idx ON item USING btree (user_id, created_at DESC);

CREATE INDEX highlight_search ON highlight USING gin (to_tsvector('english'::regconfig, quote));

CREATE INDEX job_claim_idx ON import_job USING btree (state, available_at);

CREATE INDEX knowledge_chunk_owner ON knowledge_chunk USING btree (user_id, item_id);

CREATE INDEX knowledge_chunk_search ON knowledge_chunk USING gin (to_tsvector('simple'::regconfig, content));

CREATE INDEX knowledge_chunk_search_vector ON knowledge_chunk USING gin (search);

CREATE INDEX knowledge_job_queue ON knowledge_job USING btree (state, available_at);

CREATE UNIQUE INDEX media_fingerprint_owner ON media_source USING btree (user_id, fingerprint) WHERE (fingerprint IS NOT NULL);



CREATE INDEX session_user_idx ON session USING btree (user_id);

CREATE INDEX source_file_user_idx ON source_file USING btree (user_id);

CREATE TRIGGER document_asset_deleted AFTER DELETE ON document_asset FOR EACH ROW EXECUTE FUNCTION queue_document_asset_cleanup();

CREATE TRIGGER document_source_changed AFTER UPDATE OF object_key, mime
  ON source_file FOR EACH ROW WHEN (((old.object_key IS DISTINCT FROM new.object_key) OR (old.mime IS DISTINCT FROM new.mime)))
  EXECUTE FUNCTION invalidate_document_assets();

CREATE TRIGGER document_source_deleted AFTER DELETE ON source_file FOR EACH ROW EXECUTE FUNCTION invalidate_document_assets();

CREATE TRIGGER import_job_updated BEFORE UPDATE ON import_job FOR EACH ROW EXECUTE FUNCTION stamp_import_job_update();

CREATE TRIGGER item_knowledge AFTER INSERT OR UPDATE OF passages, title, status ON item FOR EACH ROW EXECUTE FUNCTION enqueue_knowledge();

CREATE TRIGGER knowledge_chunk_search BEFORE INSERT OR UPDATE OF content, item_id ON knowledge_chunk FOR EACH ROW EXECUTE FUNCTION knowledge_chunk_search();

CREATE TRIGGER knowledge_cleanup AFTER DELETE ON knowledge_mention FOR EACH ROW EXECUTE FUNCTION clean_knowledge_entities();
