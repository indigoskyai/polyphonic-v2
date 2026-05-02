-- Harden decrypt_user_api_key: only allow self-decryption for end users.
-- Service role (used by edge functions for cron/background work) may still
-- pass an explicit p_user_id.
CREATE OR REPLACE FUNCTION public.decrypt_user_api_key(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_encrypted bytea;
  v_passphrase text;
  v_role text;
  v_caller uuid;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller := auth.uid();

  -- Authorization: service_role bypass, otherwise caller must equal target.
  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL OR v_caller <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized to decrypt this key';
    END IF;
  END IF;

  SELECT encrypted_key INTO v_encrypted
    FROM public.user_api_keys
   WHERE user_id = p_user_id;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;

  v_passphrase := current_setting('app.settings.jwt_secret', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := 'vessel-api-key-encryption-v1';
  END IF;

  RETURN extensions.pgp_sym_decrypt(v_encrypted, v_passphrase);
END;
$function$;

-- Lock down execute privileges. Authenticated users can call (will be
-- self-checked); anon cannot.
REVOKE ALL ON FUNCTION public.decrypt_user_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrypt_user_api_key(uuid) TO authenticated, service_role;