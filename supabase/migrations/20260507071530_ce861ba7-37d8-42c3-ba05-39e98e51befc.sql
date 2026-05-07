
-- 1. Ensure a strong random passphrase exists in app_config
DO $$
DECLARE
  v_existing text;
  v_new text;
BEGIN
  SELECT value INTO v_existing FROM public.app_config WHERE key = 'api_key_passphrase';
  IF v_existing IS NULL OR length(v_existing) < 32 THEN
    v_new := encode(extensions.gen_random_bytes(48), 'base64');
    INSERT INTO public.app_config (key, value)
    VALUES ('api_key_passphrase', v_new)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;
END $$;

-- 2. Re-encrypt existing user_api_keys rows from the old hardcoded fallback to the new passphrase
DO $$
DECLARE
  v_old text := 'vessel-api-key-encryption-v1';
  v_new text;
  r record;
  v_plain text;
BEGIN
  SELECT value INTO v_new FROM public.app_config WHERE key = 'api_key_passphrase';
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'api_key_passphrase missing from app_config';
  END IF;

  FOR r IN SELECT user_id, encrypted_key FROM public.user_api_keys LOOP
    BEGIN
      -- Try decrypting with new passphrase first; if it works, already migrated
      v_plain := extensions.pgp_sym_decrypt(r.encrypted_key, v_new);
    EXCEPTION WHEN others THEN
      BEGIN
        v_plain := extensions.pgp_sym_decrypt(r.encrypted_key, v_old);
        UPDATE public.user_api_keys
           SET encrypted_key = extensions.pgp_sym_encrypt(v_plain, v_new),
               updated_at = now()
         WHERE user_id = r.user_id;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Could not re-encrypt key for user %; leaving as-is', r.user_id;
      END;
    END;
  END LOOP;
END $$;

-- 3. Replace save_user_api_key — read passphrase from app_config, no fallback
CREATE OR REPLACE FUNCTION public.save_user_api_key(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_passphrase text;
  v_preview text;
  v_key_len int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_key IS NULL OR trim(p_key) = '' THEN
    DELETE FROM public.user_api_keys WHERE user_id = v_user_id;
    RETURN;
  END IF;

  SELECT value INTO v_passphrase FROM public.app_config WHERE key = 'api_key_passphrase';
  IF v_passphrase IS NULL OR length(v_passphrase) < 32 THEN
    RAISE EXCEPTION 'Server misconfigured: encryption passphrase missing';
  END IF;

  v_key_len := length(p_key);
  IF v_key_len > 10 THEN
    v_preview := substring(p_key from 1 for 6) || '...' || substring(p_key from v_key_len - 3);
  ELSE
    v_preview := '****';
  END IF;

  INSERT INTO public.user_api_keys (user_id, encrypted_key, key_preview, updated_at)
  VALUES (v_user_id, extensions.pgp_sym_encrypt(p_key, v_passphrase), v_preview, now())
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_key = extensions.pgp_sym_encrypt(p_key, v_passphrase),
    key_preview = v_preview,
    updated_at = now();
END;
$function$;

-- 4. Replace decrypt_user_api_key — read passphrase from app_config, no fallback
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
  v_claims jsonb;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  IF v_role = '' THEN
    BEGIN
      v_claims := current_setting('request.jwt.claims', true)::jsonb;
      v_role := COALESCE(v_claims->>'role', '');
    EXCEPTION WHEN others THEN
      v_role := '';
    END;
  END IF;
  v_caller := auth.uid();

  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL OR v_caller <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized to decrypt this key';
    END IF;
  END IF;

  SELECT encrypted_key INTO v_encrypted
    FROM public.user_api_keys
   WHERE user_id = p_user_id;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;

  SELECT value INTO v_passphrase FROM public.app_config WHERE key = 'api_key_passphrase';
  IF v_passphrase IS NULL OR length(v_passphrase) < 32 THEN
    RAISE EXCEPTION 'Server misconfigured: encryption passphrase missing';
  END IF;

  RETURN extensions.pgp_sym_decrypt(v_encrypted, v_passphrase);
END;
$function$;
