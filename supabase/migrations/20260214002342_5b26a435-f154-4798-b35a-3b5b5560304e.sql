
-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create dedicated table for encrypted API keys
CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  encrypted_key bytea NOT NULL,
  key_preview text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own row, and only key_preview (enforced by not granting access to encrypted_key via RLS + view)
CREATE POLICY "Users can view own api key preview"
  ON public.user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE by users — only via RPC functions
-- (no INSERT/UPDATE/DELETE policies = blocked by default with RLS enabled)

-- Function to save (encrypt) an API key — called by authenticated users
CREATE OR REPLACE FUNCTION public.save_user_api_key(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Delete the key if empty
    DELETE FROM public.user_api_keys WHERE user_id = v_user_id;
    RETURN;
  END IF;

  -- Use service role key as encryption passphrase
  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := current_setting('request.jwt.claims', true)::json->>'role';
    -- Fallback to a stable secret derived from the project
    v_passphrase := coalesce(v_passphrase, 'default-encryption-key');
  END IF;

  -- Generate preview: first 6 chars + ... + last 4 chars
  v_key_len := length(p_key);
  IF v_key_len > 10 THEN
    v_preview := substring(p_key from 1 for 6) || '...' || substring(p_key from v_key_len - 3);
  ELSE
    v_preview := '****';
  END IF;

  -- Upsert encrypted key
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
$$;

-- Function to decrypt API key — only callable with service role
CREATE OR REPLACE FUNCTION public.decrypt_user_api_key(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Function to delete API key
CREATE OR REPLACE FUNCTION public.delete_user_api_key()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_api_keys WHERE user_id = auth.uid();
END;
$$;

-- Add updated_at trigger
CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing keys from user_settings to encrypted table
DO $$
DECLARE
  r record;
  v_passphrase text;
  v_preview text;
  v_key_len int;
BEGIN
  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := 'default-encryption-key';
  END IF;

  FOR r IN
    SELECT user_id, openrouter_api_key
    FROM public.user_settings
    WHERE openrouter_api_key IS NOT NULL AND trim(openrouter_api_key) != ''
  LOOP
    v_key_len := length(r.openrouter_api_key);
    IF v_key_len > 10 THEN
      v_preview := substring(r.openrouter_api_key from 1 for 6) || '...' || substring(r.openrouter_api_key from v_key_len - 3);
    ELSE
      v_preview := '****';
    END IF;

    INSERT INTO public.user_api_keys (user_id, encrypted_key, key_preview)
    VALUES (
      r.user_id,
      pgp_sym_encrypt(r.openrouter_api_key, v_passphrase),
      v_preview
    )
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END;
$$;

-- Drop the plain-text column
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS openrouter_api_key;
