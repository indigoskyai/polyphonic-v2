-- One Luca runtime + persisted last chat target.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS last_chat_target_kind text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS last_chat_target_id text NOT NULL DEFAULT 'luca';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_last_chat_target_kind_check'
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_last_chat_target_kind_check
      CHECK (last_chat_target_kind IN ('agent', 'model'));
  END IF;
END $$;

UPDATE public.user_settings
SET
  last_chat_target_kind = 'agent',
  last_chat_target_id = COALESCE(NULLIF(landing_agent_id, ''), 'luca')
WHERE
  (last_chat_target_kind IS NULL OR last_chat_target_id IS NULL OR last_chat_target_id = '')
  OR (landing_agent_id IS NOT NULL AND last_chat_target_id = 'luca');

COMMENT ON COLUMN public.user_settings.last_chat_target_kind IS
  'Last chat target kind used on /chat: agent or model.';
COMMENT ON COLUMN public.user_settings.last_chat_target_id IS
  'Last chat target id: agent id when kind=agent, model id when kind=model.';

CREATE TABLE IF NOT EXISTS public.continuity_turn_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.continuity_turn_jobs TO authenticated;
GRANT ALL ON public.continuity_turn_jobs TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS continuity_turn_jobs_once_idx
  ON public.continuity_turn_jobs (user_id, agent_id, thread_id, source_message_id, job_name)
  WHERE status IN ('running', 'completed');

CREATE INDEX IF NOT EXISTS continuity_turn_jobs_user_agent_created_idx
  ON public.continuity_turn_jobs (user_id, agent_id, started_at DESC);

ALTER TABLE public.continuity_turn_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read their own continuity jobs" ON public.continuity_turn_jobs;
CREATE POLICY "users read their own continuity jobs"
  ON public.continuity_turn_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_skill_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  name text NOT NULL,
  description text NOT NULL,
  trigger_keywords text[] NOT NULL DEFAULT '{}',
  content text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  source_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_skill_candidates_name_format CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

GRANT SELECT ON public.agent_skill_candidates TO authenticated;
GRANT ALL ON public.agent_skill_candidates TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS agent_skill_candidates_source_name_idx
  ON public.agent_skill_candidates (user_id, agent_id, source_message_id, name)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_skill_candidates_user_agent_status_idx
  ON public.agent_skill_candidates (user_id, agent_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS update_agent_skill_candidates_updated_at ON public.agent_skill_candidates;
CREATE TRIGGER update_agent_skill_candidates_updated_at
  BEFORE UPDATE ON public.agent_skill_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_skill_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read their own skill candidates" ON public.agent_skill_candidates;
CREATE POLICY "users read their own skill candidates"
  ON public.agent_skill_candidates FOR SELECT
  USING (auth.uid() = user_id);