-- Phase L5: procedural skills Luca can distill, retrieve, and retire.

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

CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_user_agent_name_idx
  ON public.agent_skills (user_id, agent_id, name);

CREATE INDEX IF NOT EXISTS agent_skills_user_agent_updated_idx
  ON public.agent_skills (user_id, agent_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_skills_source_thread_idx
  ON public.agent_skills (source_thread_id, created_at DESC);

DROP TRIGGER IF EXISTS update_agent_skills_updated_at ON public.agent_skills;
CREATE TRIGGER update_agent_skills_updated_at
  BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read their own skills" ON public.agent_skills;
CREATE POLICY "users read their own skills"
  ON public.agent_skills FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users delete their own skills" ON public.agent_skills;
CREATE POLICY "users delete their own skills"
  ON public.agent_skills FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_skill_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  skill_name text NOT NULL,
  description text,
  source_skill_id uuid REFERENCES public.agent_skills(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_skill_denials_user_agent_name_idx
  ON public.agent_skill_denials (user_id, agent_id, skill_name);

CREATE INDEX IF NOT EXISTS agent_skill_denials_user_agent_created_idx
  ON public.agent_skill_denials (user_id, agent_id, created_at DESC);

ALTER TABLE public.agent_skill_denials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read their own skill denials" ON public.agent_skill_denials;
CREATE POLICY "users read their own skill denials"
  ON public.agent_skill_denials FOR SELECT
  USING (auth.uid() = user_id);
