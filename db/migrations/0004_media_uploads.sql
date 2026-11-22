ALTER TABLE media_source ADD COLUMN audio_object_key text;
CREATE UNIQUE INDEX media_source_audio_object ON media_source(audio_object_key) WHERE audio_object_key IS NOT NULL;

CREATE FUNCTION queue_media_audio_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.audio_object_key IS NOT NULL AND (TG_OP='DELETE' OR NEW.audio_object_key IS DISTINCT FROM OLD.audio_object_key) THEN
  INSERT INTO document_asset_cleanup(object_key) VALUES(OLD.audio_object_key) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END;
$$;

CREATE TRIGGER media_audio_removed AFTER DELETE OR UPDATE OF audio_object_key ON media_source
 FOR EACH ROW EXECUTE FUNCTION queue_media_audio_cleanup();
