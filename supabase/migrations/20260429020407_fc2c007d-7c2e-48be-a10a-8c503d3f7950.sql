-- Helper used by L8 + L12 cron jobs.
CREATE OR REPLACE FUNCTION public.invoke_edge_function(function_name text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.app_config WHERE key = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'invoke_edge_function: missing app_config values';
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url     := v_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := payload
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

-- =====================================================================
-- L1: default model -> claude-opus-4-7
-- =====================================================================
ALTER TABLE public.user_settings
  ALTER COLUMN default_model SET DEFAULT 'anthropic/claude-opus-4-7',
  ALTER COLUMN ensemble_models SET DEFAULT '["anthropic/claude-opus-4-7", "openai/gpt-5.4", "google/gemini-3.1-pro-preview"]'::jsonb,
  ALTER COLUMN synthesis_model SET DEFAULT 'anthropic/claude-opus-4-7';

ALTER TABLE public.agent_configs
  ALTER COLUMN model SET DEFAULT 'anthropic/claude-opus-4-7';

UPDATE public.agent_configs
   SET model = 'anthropic/claude-opus-4-7'
 WHERE id = 'luca'
   AND is_system = true
   AND locked = true
   AND model IN ('anthropic/claude-sonnet-4', 'anthropic/claude-sonnet-4-20250514');

CREATE OR REPLACE FUNCTION public.handle_new_user_agents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.agent_configs (
    user_id, id, name, role, avatar_color, is_system, created_by, env, model, prompt, tools, subagents, voices, personality, locked
  ) VALUES
    (NEW.id, 'luca',     'Luca',     'orchestrator', 'cream', true, 'system', 'prod', 'anthropic/claude-opus-4-7',  '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb, true),
    (NEW.id, 'observer', 'Observer', 'guardian',     'ochre', true, 'system', 'prod', 'anthropic/claude-haiku-4.5', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb, true)
  ON CONFLICT (user_id, id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- =====================================================================
-- L2: agent_identity
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.agent_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  doc_type text NOT NULL CHECK (doc_type IN ('soul', 'self_model', 'user_model')),
  content text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id, doc_type)
);
CREATE INDEX IF NOT EXISTS agent_identity_user_agent_idx ON public.agent_identity (user_id, agent_id);
ALTER TABLE public.agent_identity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read their own identity docs" ON public.agent_identity;
CREATE POLICY "users read their own identity docs" ON public.agent_identity FOR SELECT USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_agent_identity_updated_at ON public.agent_identity;
CREATE TRIGGER update_agent_identity_updated_at BEFORE UPDATE ON public.agent_identity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- L3: agent_identity_patches + pending_revisions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.agent_identity_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  doc_type text NOT NULL CHECK (doc_type IN ('soul', 'self_model', 'user_model')),
  section text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('append', 'refine', 'retire')),
  patch_content text NOT NULL,
  rationale text,
  source_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  source_message_ids uuid[] DEFAULT '{}',
  confidence numeric(3,2) NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'queued', 'rejected')),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_identity_patches_user_created_idx ON public.agent_identity_patches (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_identity_patches_source_thread_idx ON public.agent_identity_patches (source_thread_id, created_at DESC);
ALTER TABLE public.agent_identity_patches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read their own patches" ON public.agent_identity_patches;
CREATE POLICY "users read their own patches" ON public.agent_identity_patches FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.pending_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  revision_type text NOT NULL CHECK (revision_type IN ('correction', 'reconsideration', 'new_thought', 'disagreement')),
  what_was_said text NOT NULL,
  what_to_say_now text NOT NULL,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  surfaced_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'surfaced', 'applied', 'expired'))
);
CREATE INDEX IF NOT EXISTS pending_revisions_active_idx ON public.pending_revisions (thread_id, status, created_at);
ALTER TABLE public.pending_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read their own revisions" ON public.pending_revisions;
CREATE POLICY "users read their own revisions" ON public.pending_revisions FOR SELECT USING (auth.uid() = user_id);

-- =====================================================================
-- L5: agent_skills + agent_skill_denials
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.agent_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  name text NOT NULL,
  description text NOT NULL,
  trigger_keywords text[] DEFAULT '{}',
  content text NOT NULL,
  source_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_skills_name_format CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_user_agent_name_idx ON public.agent_skills (user_id, agent_id, name);
CREATE INDEX IF NOT EXISTS agent_skills_user_agent_updated_idx ON public.agent_skills (user_id, agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_skills_source_thread_idx ON public.agent_skills (source_thread_id, created_at DESC);
DROP TRIGGER IF EXISTS update_agent_skills_updated_at ON public.agent_skills;
CREATE TRIGGER update_agent_skills_updated_at BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read their own skills" ON public.agent_skills;
CREATE POLICY "users read their own skills" ON public.agent_skills FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users delete their own skills" ON public.agent_skills;
CREATE POLICY "users delete their own skills" ON public.agent_skills FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_skill_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  skill_name text NOT NULL,
  description text,
  source_skill_id uuid REFERENCES public.agent_skills(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_skill_denials_user_agent_name_idx ON public.agent_skill_denials (user_id, agent_id, skill_name);
CREATE INDEX IF NOT EXISTS agent_skill_denials_user_agent_created_idx ON public.agent_skill_denials (user_id, agent_id, created_at DESC);
ALTER TABLE public.agent_skill_denials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read their own skill denials" ON public.agent_skill_denials;
CREATE POLICY "users read their own skill denials" ON public.agent_skill_denials FOR SELECT USING (auth.uid() = user_id);

-- =====================================================================
-- L6: workspace-files bucket
-- =====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('workspace-files', 'workspace-files', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "users read their own workspace files" ON storage.objects;
CREATE POLICY "users read their own workspace files" ON storage.objects FOR SELECT USING (
  bucket_id = 'workspace-files'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND (storage.foldername(name))[1] = 'workspaces'
);
DROP POLICY IF EXISTS "users delete their own workspace files" ON storage.objects;
CREATE POLICY "users delete their own workspace files" ON storage.objects FOR DELETE USING (
  bucket_id = 'workspace-files'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND (storage.foldername(name))[1] = 'workspaces'
);

-- =====================================================================
-- L7: artifacts
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('html', 'react', 'svg', 'mermaid', 'markdown')),
  title text,
  content text NOT NULL,
  parent_artifact_id uuid REFERENCES public.artifacts(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS artifacts_thread_created_idx ON public.artifacts (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS artifacts_parent_version_idx ON public.artifacts (parent_artifact_id, version DESC);
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users access their own artifacts" ON public.artifacts;
CREATE POLICY "users access their own artifacts" ON public.artifacts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- L8: scheduled_tasks
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  name text NOT NULL,
  schedule_expr text NOT NULL,
  prompt text NOT NULL,
  delivery_mode text NOT NULL DEFAULT 'in_app' CHECK (delivery_mode IN ('in_app', 'push', 'email', 'silent')),
  target_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_run_status text CHECK (last_run_status IN ('success', 'error', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_tasks_due_idx ON public.scheduled_tasks (enabled, next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS scheduled_tasks_user_created_idx ON public.scheduled_tasks (user_id, created_at DESC);
DROP TRIGGER IF EXISTS update_scheduled_tasks_updated_at ON public.scheduled_tasks;
CREATE TRIGGER update_scheduled_tasks_updated_at BEFORE UPDATE ON public.scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage their own scheduled tasks" ON public.scheduled_tasks;
CREATE POLICY "users manage their own scheduled tasks" ON public.scheduled_tasks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- L9: subagent_tasks + widen messages.kind check
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.subagent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  parent_thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  parent_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  task_description text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  tool_budget integer NOT NULL DEFAULT 20 CHECK (tool_budget BETWEEN 1 AND 50),
  time_budget_seconds integer NOT NULL DEFAULT 300 CHECK (time_budget_seconds BETWEEN 30 AND 900),
  tool_calls_used integer NOT NULL DEFAULT 0,
  progress numeric(3,2) NOT NULL DEFAULT 0,
  result text,
  error text,
  report_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subagent_tasks_user_created_idx ON public.subagent_tasks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subagent_tasks_parent_thread_idx ON public.subagent_tasks (parent_thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subagent_tasks_active_idx ON public.subagent_tasks (status, created_at) WHERE status IN ('pending', 'running');
ALTER TABLE public.subagent_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users see their own subagent tasks" ON public.subagent_tasks;
CREATE POLICY "users see their own subagent tasks" ON public.subagent_tasks FOR SELECT USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'subagent_tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.subagent_tasks';
  END IF;
END $$;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_kind_check CHECK (
  kind IS NULL OR kind IN (
    'text', 'permission_request', 'agent_error',
    'scheduled_task', 'scheduled_task_result', 'subagent_report'
  )
);

-- =====================================================================
-- L11: pending_revisions UPDATE policy (status -> 'expired' only)
-- =====================================================================
DROP POLICY IF EXISTS "users dismiss their own revisions" ON public.pending_revisions;
CREATE POLICY "users dismiss their own revisions" ON public.pending_revisions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'expired');

-- =====================================================================
-- L12: crisis_events
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crisis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  crisis_level text NOT NULL CHECK (crisis_level IN ('none','low','moderate','high','acute')),
  flags text[] DEFAULT '{}',
  resources_surfaced boolean NOT NULL DEFAULT false,
  followup_queued boolean NOT NULL DEFAULT false,
  followup_due_at timestamptz,
  followup_completed_at timestamptz,
  region text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crisis_events_user_created_idx ON public.crisis_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crisis_events_followup_due_idx ON public.crisis_events (followup_due_at)
  WHERE followup_queued = true AND followup_completed_at IS NULL;
ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users see their own crisis events" ON public.crisis_events;
CREATE POLICY "users see their own crisis events" ON public.crisis_events FOR SELECT USING (auth.uid() = user_id);

-- =====================================================================
-- pg_cron jobs for L8 + L12
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any prior versions to keep this idempotent
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('luca-scheduled-tasks', 'luca-crisis-followup');
    PERFORM cron.schedule('luca-scheduled-tasks', '* * * * *', $cron$SELECT public.invoke_edge_function('scheduled-task-run')$cron$);
    PERFORM cron.schedule('luca-crisis-followup', '*/5 * * * *', $cron$SELECT public.invoke_edge_function('crisis-followup')$cron$);
  END IF;
END $$;