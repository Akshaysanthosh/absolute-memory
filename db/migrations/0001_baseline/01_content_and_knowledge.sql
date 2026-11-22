-- Absolute Memory baseline. Foreign keys follow the table and index definitions.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE FUNCTION clean_knowledge_entities() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 DELETE FROM knowledge_entity e WHERE e.user_id=OLD.user_id AND NOT EXISTS(SELECT 1 FROM knowledge_mention m WHERE m.entity_id=e.id AND m.user_id=e.user_id);
 RETURN OLD;
END $$;

CREATE FUNCTION enqueue_knowledge() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF NEW.status='ready' AND (
  TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.passages IS DISTINCT FROM NEW.passages OR OLD.title IS DISTINCT FROM NEW.title
 ) THEN
  INSERT INTO knowledge_job(item_id,user_id) VALUES(NEW.id,NEW.user_id)
  ON CONFLICT(item_id) DO UPDATE SET
   revision=knowledge_job.revision+1,state='queued',stage='chunks',attempts=0,lease=NULL,content_hash=NULL,
   summary='',summary_parts=NULL,error=NULL,available_at=now(),updated_at=now();
  DELETE FROM knowledge_chunk WHERE item_id=NEW.id;
  DELETE FROM knowledge_tag WHERE item_id=NEW.id AND origin='auto';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION invalidate_document_assets() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 INSERT INTO document_asset_cleanup(object_key) VALUES(OLD.object_key) ON CONFLICT DO NOTHING;
 DELETE FROM document_asset WHERE item_id=OLD.item_id AND user_id=OLD.user_id;
 RETURN OLD;
END $$;

CREATE FUNCTION knowledge_chunk_document(title text, content text) RETURNS tsvector
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
 SELECT setweight(to_tsvector('english'::regconfig,coalesce(title,'')),'A') || setweight(to_tsvector('english'::regconfig,coalesce(content,'')),'B')
$$;

CREATE FUNCTION knowledge_chunk_search() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 NEW.search := (SELECT knowledge_chunk_document(i.title,NEW.content) FROM item i WHERE i.id=NEW.item_id AND i.user_id=NEW.user_id);
 RETURN NEW;
END $$;

CREATE FUNCTION queue_document_asset_cleanup() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 INSERT INTO document_asset_cleanup(object_key) VALUES(OLD.object_key) ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;

CREATE FUNCTION stamp_import_job_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;

CREATE TABLE account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE auth_rate_limit (
    id text NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    last_request bigint NOT NULL
);

CREATE TABLE capture_receipt (
    hash text NOT NULL,
    token_id uuid NOT NULL,
    item_id uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '1 day'::interval) NOT NULL
);

CREATE TABLE capture_token (
    id uuid NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);

CREATE TABLE document_asset (
    item_id uuid NOT NULL,
    user_id text NOT NULL,
    variant text NOT NULL,
    digest text NOT NULL,
    object_key text NOT NULL,
    size integer NOT NULL,
    mime text NOT NULL,
    content_digest text,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_asset_content_digest_check CHECK ((content_digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT document_asset_digest_check CHECK ((digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT document_asset_size_check CHECK ((size > 0)),
    CONSTRAINT document_asset_variant_check CHECK (variant = 'thumbnail-v1')
);

CREATE TABLE document_asset_cleanup (
    object_key text NOT NULL,
    available_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL
);

CREATE TABLE extension_pair (
    challenge text NOT NULL,
    user_id text NOT NULL,
    token_id uuid,
    redeemed boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL
);

CREATE TABLE highlight (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
    item_id uuid NOT NULL,
    quote text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE highlight_segment (
    highlight_id uuid REFERENCES highlight(id) ON DELETE CASCADE,
    passage_index integer NOT NULL CHECK (passage_index >= 0),
    start_offset integer NOT NULL CHECK (start_offset >= 0),
    end_offset integer NOT NULL CHECK (end_offset > start_offset),
    quoted_text text NOT NULL,
    PRIMARY KEY (highlight_id, passage_index)
);

CREATE TABLE import_job (
    id uuid NOT NULL,
    item_id uuid NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    lock_token uuid,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT import_job_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'failed'::text])))
);

CREATE TABLE integration_save (
    token_id uuid NOT NULL,
    user_id text NOT NULL,
    item_id uuid NOT NULL,
    request_hash text,
    input_hash text,
    CONSTRAINT integration_save_check CHECK (((request_hash IS NULL) = (input_hash IS NULL)))
);

CREATE TABLE integration_token (
    id uuid NOT NULL,
    user_id text NOT NULL,
    label text NOT NULL,
    token_hash text NOT NULL,
    scopes text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    CONSTRAINT integration_token_scopes_check CHECK ((((cardinality(scopes) >= 1)
      AND (cardinality(scopes) <= 2))
      AND (scopes <@ ARRAY['library:read'::text, 'library:write'::text])))
);

CREATE TABLE item (
    id uuid NOT NULL,
    user_id text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    url text,
    domain text,
    author text,
    excerpt text DEFAULT ''::text NOT NULL,
    reading_html text DEFAULT '' NOT NULL,
    passages jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_at text,
    source_name text,
    words integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    error text,
    archived boolean DEFAULT false NOT NULL,
    favorite boolean DEFAULT false NOT NULL,
    progress real DEFAULT 0 NOT NULL,
    channel text DEFAULT 'web'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_at timestamp with time zone,
    reader_position integer CHECK (reader_position >= 0),
    origin_turn_id uuid,
    bookmark_type text,
    source_details jsonb,
    quote_key text,
    sample_key text,
    CONSTRAINT item_bookmark_type_check CHECK ((bookmark_type = ANY (ARRAY['website'::text, 'product'::text]))),
    CONSTRAINT item_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'extension'::text, 'api'::text]))),
    CONSTRAINT item_kind_check CHECK ((kind = ANY (ARRAY['article'::text, 'note'::text, 'pdf'::text, 'image'::text, 'spreadsheet'::text]))),
    CONSTRAINT item_progress_check CHECK (((progress >= (0)::double precision) AND (progress <= (1)::double precision))),
    CONSTRAINT item_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text])))
);

CREATE TABLE item_source_raw (
    item_id uuid NOT NULL,
    user_id text NOT NULL,
    provider text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    data jsonb NOT NULL,
    CONSTRAINT item_source_raw_data_check CHECK ((octet_length((data)::text) <= 65536)),
    CONSTRAINT item_source_raw_provider_check CHECK ((provider = ANY (ARRAY['reddit'::text, 'article'::text, 'extension'::text, 'podcast'::text])))
);

CREATE TABLE knowledge_chunk (
    id uuid NOT NULL,
    user_id text NOT NULL,
    item_id uuid NOT NULL,
    ordinal integer NOT NULL,
    content_hash text NOT NULL,
    content text NOT NULL,
    passage_indices integer[] NOT NULL CHECK (cardinality(passage_indices) > 0),
    embedding vector(1536),
    embedding_model text DEFAULT 'text-embedding-3-small'::text NOT NULL,
    analysis jsonb,
    search tsvector
);

CREATE TABLE knowledge_edge (
    id uuid NOT NULL,
    user_id text NOT NULL,
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    chunk_id uuid NOT NULL,
    label text NOT NULL,
    evidence text NOT NULL
);

CREATE TABLE knowledge_entity (
    id uuid NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL
);

CREATE TABLE knowledge_job (
    item_id uuid NOT NULL,
    user_id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    content_hash text,
    state text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT 'chunks'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    lease uuid,
    locked_at timestamp with time zone,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    error text,
    summary text DEFAULT ''::text NOT NULL,
    summary_parts jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_job_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'ready'::text, 'failed'::text])))
);

CREATE TABLE knowledge_mention (
    user_id text NOT NULL,
    entity_id uuid NOT NULL,
    chunk_id uuid NOT NULL,
    evidence text NOT NULL
);

CREATE TABLE knowledge_tag (
    user_id text NOT NULL,
    item_id uuid NOT NULL,
    name text NOT NULL,
    origin text NOT NULL,
    CONSTRAINT knowledge_tag_origin_check CHECK ((origin = ANY (ARRAY['auto'::text, 'manual'::text, 'dismissed'::text, 'source'::text])))
);

CREATE TABLE knowledge_usage (
    id uuid NOT NULL,
    user_id text NOT NULL,
    feature text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    duration_ms integer NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE library_thread (
    id uuid NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE library_turn (
    id uuid NOT NULL,
    user_id text NOT NULL,
    thread_id uuid NOT NULL,
    request_id uuid NOT NULL,
    question text NOT NULL,
    answer text DEFAULT ''::text NOT NULL,
    state text DEFAULT 'running'::text NOT NULL,
    web boolean DEFAULT false NOT NULL,
    sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);
