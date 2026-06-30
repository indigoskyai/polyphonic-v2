-- Keep Supabase Cron's run-history table bounded.
CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details(
  p_retention interval DEFAULT interval '7 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_retention < interval '1 day' THEN
    RAISE EXCEPTION 'p_retention must be at least 1 day';
  END IF;

  DELETE FROM cron.job_run_details
   WHERE end_time IS NOT NULL
     AND end_time < now() - p_retention;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.prune_cron_job_run_details(interval) IS
  'Prunes completed rows from cron.job_run_details so pg_cron history cannot grow without bound.';

REVOKE EXECUTE ON FUNCTION public.prune_cron_job_run_details(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_cron_job_run_details(interval) TO service_role;

SELECT cron.unschedule('prune-cron-job-run-details')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-cron-job-run-details');

SELECT cron.schedule(
  'prune-cron-job-run-details',
  '17 2 * * *',
  $$SELECT public.prune_cron_job_run_details('7 days'::interval)$$
);

-- Research Lab: user-owned evidence cards for reproducible scientific claims.
CREATE TABLE IF NOT EXISTS public.research_evidence_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id text NOT NULL DEFAULT 'luca',
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  title text NOT NULL,
  question text NOT NULL,
  dataset_id text NOT NULL,
  dataset_label text NOT NULL,
  evidence_level text NOT NULL DEFAULT 'catalog-only',
  claim_boundary text NOT NULL,
  access_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  measurements jsonb NOT NULL DEFAULT '[]'::jsonb,
  caveats jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_access jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary text,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_evidence_cards_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT research_evidence_cards_question_not_blank CHECK (length(btrim(question)) > 0),
  CONSTRAINT research_evidence_cards_dataset_id_not_blank CHECK (length(btrim(dataset_id)) > 0),
  CONSTRAINT research_evidence_cards_evidence_level_check CHECK (
    evidence_level IN ('simulation-direct', 'simulation-proxy', 'catalog-only')
  ),
  CONSTRAINT research_evidence_cards_status_check CHECK (
    status IN ('draft', 'ready', 'validated', 'archived')
  ),
  CONSTRAINT research_evidence_cards_access_plan_array CHECK (jsonb_typeof(access_plan) = 'array'),
  CONSTRAINT research_evidence_cards_measurements_array CHECK (jsonb_typeof(measurements) = 'array'),
  CONSTRAINT research_evidence_cards_caveats_array CHECK (jsonb_typeof(caveats) = 'array'),
  CONSTRAINT research_evidence_cards_raw_access_object CHECK (jsonb_typeof(raw_access) = 'object'),
  CONSTRAINT research_evidence_cards_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_evidence_cards TO authenticated;
GRANT ALL ON public.research_evidence_cards TO service_role;

ALTER TABLE public.research_evidence_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can view own research evidence cards"
  ON public.research_evidence_cards FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can create own research evidence cards"
  ON public.research_evidence_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can update own research evidence cards"
  ON public.research_evidence_cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can delete own research evidence cards"
  ON public.research_evidence_cards FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Service role full access research evidence cards"
  ON public.research_evidence_cards FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_research_evidence_cards_updated_at ON public.research_evidence_cards;
CREATE TRIGGER update_research_evidence_cards_updated_at
  BEFORE UPDATE ON public.research_evidence_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS research_evidence_cards_user_recent_idx
  ON public.research_evidence_cards(user_id, archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS research_evidence_cards_user_dataset_idx
  ON public.research_evidence_cards(user_id, dataset_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS research_evidence_cards_thread_idx
  ON public.research_evidence_cards(thread_id, updated_at DESC)
  WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS research_evidence_cards_project_idx
  ON public.research_evidence_cards(project_id, updated_at DESC)
  WHERE project_id IS NOT NULL;

-- Inline Simulation Turns: persist deterministic simulation artifacts.
ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_kind_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_kind_check
  CHECK (kind IN ('html', 'react', 'svg', 'mermaid', 'markdown', 'simulation'));

ALTER TABLE public.research_evidence_cards
  ADD COLUMN IF NOT EXISTS artifact_id uuid REFERENCES public.artifacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS research_evidence_cards_artifact_idx
  ON public.research_evidence_cards(artifact_id)
  WHERE artifact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_research_evidence_card_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.threads t
    WHERE t.id = NEW.thread_id
      AND t.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Research evidence card thread must belong to card owner';
  END IF;

  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = NEW.project_id
      AND p.user_id = NEW.user_id
      AND p.archived = false
  ) THEN
    RAISE EXCEPTION 'Research evidence card project must belong to card owner';
  END IF;

  IF NEW.source_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = NEW.source_message_id
      AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Research evidence card source message must belong to card owner';
  END IF;

  IF NEW.artifact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.artifacts a
    WHERE a.id = NEW.artifact_id
      AND a.user_id = NEW.user_id
      AND (NEW.thread_id IS NULL OR a.thread_id = NEW.thread_id)
  ) THEN
    RAISE EXCEPTION 'Research evidence card artifact must belong to card owner and thread';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_research_evidence_card_scope ON public.research_evidence_cards;
CREATE TRIGGER validate_research_evidence_card_scope
  BEFORE INSERT OR UPDATE OF user_id, thread_id, project_id, source_message_id, artifact_id
  ON public.research_evidence_cards
  FOR EACH ROW EXECUTE FUNCTION public.validate_research_evidence_card_scope();

-- Agent social channels (per-agent X connection, policy, queue, credit ledger).
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
  CONSTRAINT agent_social_channels_platform_check CHECK (platform IN ('x'))
);

GRANT SELECT, UPDATE ON public.agent_social_channels TO authenticated;
GRANT ALL ON public.agent_social_channels TO service_role;

CREATE TABLE IF NOT EXISTS public.agent_social_channel_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.agent_social_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  platform text NOT NULL DEFAULT 'x',
  access_token text NOT NULL,
  refresh_token text,
  token_type text NOT NULL DEFAULT 'bearer',
  scope text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_social_channel_credentials_platform_check CHECK (platform IN ('x'))
);

GRANT ALL ON public.agent_social_channel_credentials TO service_role;

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

GRANT ALL ON public.agent_social_oauth_states TO service_role;

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

GRANT SELECT, UPDATE ON public.agent_social_posts TO authenticated;
GRANT ALL ON public.agent_social_posts TO service_role;

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

GRANT SELECT ON public.agent_social_credit_ledger TO authenticated;
GRANT ALL ON public.agent_social_credit_ledger TO service_role;

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

DROP POLICY IF EXISTS "Users can view own agent social channels" ON public.agent_social_channels;
CREATE POLICY "Users can view own agent social channels"
  ON public.agent_social_channels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own agent social channel policies" ON public.agent_social_channels;
CREATE POLICY "Users can manage own agent social channel policies"
  ON public.agent_social_channels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages agent social channels" ON public.agent_social_channels;
CREATE POLICY "Service role manages agent social channels"
  ON public.agent_social_channels FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages agent social credentials" ON public.agent_social_channel_credentials;
CREATE POLICY "Service role manages agent social credentials"
  ON public.agent_social_channel_credentials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages agent social oauth states" ON public.agent_social_oauth_states;
CREATE POLICY "Service role manages agent social oauth states"
  ON public.agent_social_oauth_states FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own agent social posts" ON public.agent_social_posts;
CREATE POLICY "Users can view own agent social posts"
  ON public.agent_social_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own agent social posts" ON public.agent_social_posts;
CREATE POLICY "Users can manage own agent social posts"
  ON public.agent_social_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages agent social posts" ON public.agent_social_posts;
CREATE POLICY "Service role manages agent social posts"
  ON public.agent_social_posts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own agent social credit ledger" ON public.agent_social_credit_ledger;
CREATE POLICY "Users can view own agent social credit ledger"
  ON public.agent_social_credit_ledger FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages agent social credit ledger" ON public.agent_social_credit_ledger;
CREATE POLICY "Service role manages agent social credit ledger"
  ON public.agent_social_credit_ledger FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Schedule the X autopilot worker every 5 minutes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (
       SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'invoke_edge_function'
     ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'agent-social-x-autopilot';

    PERFORM cron.schedule(
      'agent-social-x-autopilot',
      '*/5 * * * *',
      $cron$SELECT public.invoke_edge_function(
        'agent-social-x-autopilot',
        '{"action":"run_due","limit":12}'::jsonb
      )$cron$
    );
  END IF;
END $$;

-- Re-apply Mnemos auto-commit hold for bridge candidates (idempotent).
CREATE OR REPLACE FUNCTION public.auto_commit_stale_memory_candidates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_candidate record;
BEGIN
  FOR v_candidate IN
    SELECT id, user_id, agent_id, content, memory_type, confidence, source
    FROM public.memory_candidates
    WHERE status = 'pending'
      AND created_at < (now() - interval '48 hours')
      AND COALESCE(source->>'source', '') <> 'mnemos_consolidation'
    LIMIT 200
  LOOP
    INSERT INTO public.memories (
      user_id, agent_id, content, memory_type, confidence, provenance
    ) VALUES (
      v_candidate.user_id,
      COALESCE(v_candidate.agent_id, 'luca'),
      v_candidate.content,
      v_candidate.memory_type,
      LEAST(GREATEST(v_candidate.confidence * 0.7, 0), 1),
      COALESCE(v_candidate.source, '{}'::jsonb)
        || jsonb_build_object('auto_committed', true, 'candidate_id', v_candidate.id)
    );

    UPDATE public.memory_candidates
    SET status = 'committed', reviewed_at = now()
    WHERE id = v_candidate.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_commit_stale_memory_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_commit_stale_memory_candidates() TO service_role;
