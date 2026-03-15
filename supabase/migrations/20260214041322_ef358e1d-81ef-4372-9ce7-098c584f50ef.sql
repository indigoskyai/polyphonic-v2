-- Fix save_user_api_key to reference pgcrypto in extensions schema
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_key IS NULL OR trim(p_key) = '' THEN
    DELETE FROM public.user_api_keys WHERE user_id = v_user_id;
    RETURN;
  END IF;

  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := current_setting('request.jwt.claims', true)::json->>'role';
    v_passphrase := coalesce(v_passphrase, 'default-encryption-key');
  END IF;

  v_key_len := length(p_key);
  IF v_key_len > 10 THEN
    v_preview := substring(p_key from 1 for 6) || '...' || substring(p_key from v_key_len - 3);
  ELSE
    v_preview := '****';
  END IF;

  INSERT INTO public.user_api_keys (user_id, encrypted_key, key_preview, updated_at)
  VALUES (
    v_user_id,
    pgp_sym_encrypt(p_key, v_passphrase),
    v_preview,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_key = pgp_sym_encrypt(p_key, v_passphrase),
    key_preview = v_preview,
    updated_at = now();
END;
$function$;

-- Fix decrypt_user_api_key to reference pgcrypto in extensions schema
CREATE OR REPLACE FUNCTION public.decrypt_user_api_key(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_encrypted bytea;
  v_passphrase text;
BEGIN
  SELECT encrypted_key INTO v_encrypted
  FROM public.user_api_keys
  WHERE user_id = p_user_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := current_setting('request.jwt.claims', true)::json->>'role';
    v_passphrase := coalesce(v_passphrase, 'default-encryption-key');
  END IF;

  RETURN pgp_sym_decrypt(v_encrypted, v_passphrase);
END;
$function$;