ALTER TABLE ONLY account
    ADD CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY capture_receipt
    ADD CONSTRAINT capture_receipt_item_id_fkey FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE;

ALTER TABLE ONLY capture_receipt
    ADD CONSTRAINT capture_receipt_token_id_fkey FOREIGN KEY (token_id) REFERENCES capture_token(id) ON DELETE CASCADE;

ALTER TABLE ONLY capture_token
    ADD CONSTRAINT capture_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY document_asset
    ADD CONSTRAINT document_asset_item_id_user_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY extension_pair
    ADD CONSTRAINT extension_pair_token_id_fkey FOREIGN KEY (token_id) REFERENCES capture_token(id) ON DELETE SET NULL;

ALTER TABLE ONLY extension_pair
    ADD CONSTRAINT extension_pair_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY highlight
    ADD CONSTRAINT highlight_item_id_user_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY highlight
    ADD CONSTRAINT highlight_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY import_job
    ADD CONSTRAINT import_job_item_id_fkey FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE;

ALTER TABLE ONLY integration_save
    ADD CONSTRAINT integration_save_item_id_user_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY integration_save
    ADD CONSTRAINT integration_save_token_id_user_id_fkey FOREIGN KEY (token_id, user_id) REFERENCES integration_token(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY integration_token
    ADD CONSTRAINT integration_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY item_source_raw
    ADD CONSTRAINT item_source_raw_item_id_fkey FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE;

ALTER TABLE ONLY item_source_raw
    ADD CONSTRAINT item_source_raw_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY item
    ADD CONSTRAINT item_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_chunk
    ADD CONSTRAINT knowledge_chunk_item_id_user_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_edge
    ADD CONSTRAINT knowledge_edge_chunk_id_user_id_fkey FOREIGN KEY (chunk_id, user_id) REFERENCES knowledge_chunk(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_edge
    ADD CONSTRAINT knowledge_edge_source_id_user_id_fkey FOREIGN KEY (source_id, user_id) REFERENCES knowledge_entity(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_edge
    ADD CONSTRAINT knowledge_edge_target_id_user_id_fkey FOREIGN KEY (target_id, user_id) REFERENCES knowledge_entity(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_entity
    ADD CONSTRAINT knowledge_entity_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_job
    ADD CONSTRAINT knowledge_job_item_id_user_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_mention
    ADD CONSTRAINT knowledge_mention_chunk_id_user_id_fkey FOREIGN KEY (chunk_id, user_id) REFERENCES knowledge_chunk(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_mention
    ADD CONSTRAINT knowledge_mention_entity_id_user_id_fkey FOREIGN KEY (entity_id, user_id) REFERENCES knowledge_entity(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_tag
    ADD CONSTRAINT knowledge_tag_item_id_user_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY knowledge_usage
    ADD CONSTRAINT knowledge_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY library_thread
    ADD CONSTRAINT library_thread_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY library_turn
    ADD CONSTRAINT library_turn_thread_id_user_id_fkey FOREIGN KEY (thread_id, user_id) REFERENCES library_thread(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY media_source
    ADD CONSTRAINT media_source_item_id_user_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY note_document
    ADD CONSTRAINT note_document_item_id_fkey FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE;

ALTER TABLE ONLY note_revision
    ADD CONSTRAINT note_revision_item_id_fkey FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE;

ALTER TABLE ONLY onboarding_profile
    ADD CONSTRAINT onboarding_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY sample_seed
    ADD CONSTRAINT sample_seed_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY session
    ADD CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY source_file
    ADD CONSTRAINT source_file_item_id_fkey FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY source_file
    ADD CONSTRAINT source_file_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY topic_page
    ADD CONSTRAINT topic_page_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

CREATE TABLE instance_setting (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    owner_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
    embedding_model text,
    embedding_dimensions integer CHECK (embedding_dimensions > 0),
    schema_version integer NOT NULL DEFAULT 1
);

INSERT INTO instance_setting DEFAULT VALUES;

CREATE TABLE reading_image (
    item_id uuid NOT NULL,
    user_id text NOT NULL,
    slot integer NOT NULL CHECK (slot >= 0),
    object_key text NOT NULL,
    mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
    size integer NOT NULL CHECK (size > 0),
    PRIMARY KEY (item_id, slot),
    FOREIGN KEY (item_id, user_id) REFERENCES item(id, user_id) ON DELETE CASCADE
);

CREATE TRIGGER reading_image_cleanup
    AFTER DELETE ON reading_image
    FOR EACH ROW EXECUTE FUNCTION queue_document_asset_cleanup();
