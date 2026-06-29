-- Agent social channels: per-agent X connections, policy, queue, and credits.
-- The legacy entity_social_accounts table is intentionally left alone.

CREATE TABLE IF NOT EXISTS public.agent_social_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  platform text NOT NULL DEFAULT 'x',
  status text NOT NULL DEFAULT 'draft',
  x_user_id text,
  x_username text,
  display_name text,
  profile_image_url text,
  posting_enabled boolean NOT NULL DEFAULT false,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  last_posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_social_channels_platform_check CHECK (platform IN ('x')),
  CONSTRAINT agent_social_channels_status_check CHECK (
    status IN ('draft', 'connecting', 'connected', 'needs_attention', 'disconnected')
  ),
  CONSTRAINT agent_social_channels_policy_object_check CHECK (jsonb_typeof(policy) = 'object'),
  CONSTRAINT agent_social_channels_billing_object_check CHECK (jsonb_typeof(billing) = 'object'),
  CONSTRAINT agent_social_channels_unique_agent_platform UNIQUE (user_id, agent_id, platform)
);

CREATE TABLE IF NOT EXISTS public.agent_social_channel_credentials (
  channel_id uuid PRIMARY KEY REFERENCES public.agent_social_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'x',
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  token_type text,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_social_channel_credentials_platform_check CHECK (platform IN ('x'))
);

CREATE TABLE IF NOT EXISTS public.agent_social_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  platform text NOT NULL DEFAULT 'x',
  state text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  redirect_origin text,
  redirect_path text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_social_oauth_states_platform_check CHECK (platform IN ('x'))
);

CREATE TABLE IF NOT EXISTS public.agent_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.agent_social_channels(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  platform text NOT NULL DEFAULT 'x',
  status text NOT NULL DEFAULT 'draft',
  approval_required boolean NOT NULL DEFAULT true,
  text text NOT NULL,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_for timestamptz,
  posted_at timestamptz,
  external_post_id text,
  failure_reason text,
  cost_credits numeric(12, 4) NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_social_posts_platform_check CHECK (platform IN ('x')),
  CONSTRAINT agent_social_posts_status_check CHECK (
    status IN ('draft', 'queued', 'approved', 'posting', 'posted', 'failed', 'cancelled')
  ),
  CONSTRAINT agent_social_posts_media_array_check CHECK (jsonb_typeof(media) = 'array'),
  CONSTRAINT agent_social_posts_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT agent_social_posts_text_length_check CHECK (char_length(text) BETWEEN 1 AND 280)
);

CREATE TABLE IF NOT EXISTS public.agent_social_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.agent_social_channels(id) ON DELETE SET NULL,
  agent_id text,
  source text NOT NULL,
  amount_credits numeric(14, 4) NOT NULL,
  amount_mnemos numeric(24, 8),
  wallet_address text,
  tx_signature text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_social_credit_ledger_source_check CHECK (
    source IN (
      'subscription_grant',
      'mnemos_deposit',
      'mnemos_donation',
      'post_debit',
      'manual_adjustment',
      'refund'
    )
  ),
  CONSTRAINT agent_social_credit_ledger_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_social_credit_ledger_tx_unique
  ON public.agent_social_credit_ledger(tx_signature)
  WHERE tx_signature IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_social_channels_user_agent_idx
  ON public.agent_social_channels(user_id, agent_id, platform);
CREATE INDEX IF NOT EXISTS agent_social_posts_channel_status_idx
  ON public.agent_social_posts(channel_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS agent_social_posts_user_created_idx
  ON public.agent_social_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_social_credit_ledger_channel_idx
  ON public.agent_social_credit_ledger(user_id, channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_social_oauth_states_state_idx
  ON public.agent_social_oauth_states(state)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.agent_social_credit_balance(
  p_user_id uuid,
  p_channel_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_credits), 0)
  FROM public.agent_social_credit_ledger
  WHERE user_id = p_user_id
    AND (p_channel_id IS NULL OR channel_id = p_channel_id);
$$;

REVOKE EXECUTE ON FUNCTION public.agent_social_credit_balance(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_agent_social_channel_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owns_agent boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.agent_configs ac
    WHERE ac.user_id = NEW.user_id
      AND ac.id = NEW.agent_id
      AND ac.locked = false
      AND ac.is_system = false
      AND ac.pending = false
  )
  INTO owns_agent;

  IF NOT owns_agent THEN
    RAISE EXCEPTION 'Agent social channel must reference an editable agent owned by the user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_agent_social_channel_scope_trigger ON public.agent_social_channels;
CREATE TRIGGER validate_agent_social_channel_scope_trigger
  BEFORE INSERT OR UPDATE OF user_id, agent_id
  ON public.agent_social_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_agent_social_channel_scope();

CREATE OR REPLACE FUNCTION public.validate_agent_social_post_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_record record;
BEGIN
  SELECT user_id, agent_id, platform
  INTO channel_record
  FROM public.agent_social_channels
  WHERE id = NEW.channel_id;

  IF channel_record IS NULL THEN
    RAISE EXCEPTION 'Social post must reference an existing channel';
  END IF;

  IF channel_record.user_id <> NEW.user_id
     OR channel_record.agent_id <> NEW.agent_id
     OR channel_record.platform <> NEW.platform THEN
    RAISE EXCEPTION 'Social post scope does not match channel scope';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_agent_social_post_scope_trigger ON public.agent_social_posts;
CREATE TRIGGER validate_agent_social_post_scope_trigger
  BEFORE INSERT OR UPDATE OF user_id, agent_id, platform, channel_id
  ON public.agent_social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_agent_social_post_scope();

CREATE OR REPLACE FUNCTION public.touch_agent_social_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_agent_social_channels_updated_at ON public.agent_social_channels;
CREATE TRIGGER touch_agent_social_channels_updated_at
  BEFORE UPDATE ON public.agent_social_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_agent_social_updated_at();

DROP TRIGGER IF EXISTS touch_agent_social_credentials_updated_at ON public.agent_social_channel_credentials;
CREATE TRIGGER touch_agent_social_credentials_updated_at
  BEFORE UPDATE ON public.agent_social_channel_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_agent_social_updated_at();

DROP TRIGGER IF EXISTS touch_agent_social_posts_updated_at ON public.agent_social_posts;
CREATE TRIGGER touch_agent_social_posts_updated_at
  BEFORE UPDATE ON public.agent_social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_agent_social_updated_at();

ALTER TABLE public.agent_social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_social_channel_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_social_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_social_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent social channels"
  ON public.agent_social_channels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own agent social channel policies"
  ON public.agent_social_channels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages agent social channels"
  ON public.agent_social_channels FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages agent social credentials"
  ON public.agent_social_channel_credentials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role manages agent social oauth states"
  ON public.agent_social_oauth_states FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own agent social posts"
  ON public.agent_social_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own agent social posts"
  ON public.agent_social_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages agent social posts"
  ON public.agent_social_posts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own agent social credit ledger"
  ON public.agent_social_credit_ledger FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages agent social credit ledger"
  ON public.agent_social_credit_ledger FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
