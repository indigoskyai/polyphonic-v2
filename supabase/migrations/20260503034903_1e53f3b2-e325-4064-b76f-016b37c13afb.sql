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

  v_passphrase := current_setting('app.settings.jwt_secret', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := 'vessel-api-key-encryption-v1';
  END IF;

  RETURN extensions.pgp_sym_decrypt(v_encrypted, v_passphrase);
END;
$function$;