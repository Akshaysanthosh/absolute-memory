CREATE FUNCTION revoke_keys_for_credential_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_id <> 'credential' OR NEW.password IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.password IS NOT DISTINCT FROM NEW.password THEN
    RETURN NEW;
  END IF;

  DELETE FROM integration_token WHERE user_id = NEW.user_id;
  DELETE FROM capture_token WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER remove_keys_on_password_write
AFTER INSERT OR UPDATE OF password ON account
FOR EACH ROW EXECUTE FUNCTION revoke_keys_for_credential_change();
