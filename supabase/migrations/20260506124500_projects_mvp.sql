-- Projects MVP: scoped workspaces for organizing threads and carrying
-- project instructions into runtime context.

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  instructions text,
  color text NOT NULL DEFAULT 'neutral',
  icon text NOT NULL DEFAULT 'folder',
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_not_blank CHECK (length(btrim(name)) > 0)
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own projects" ON public.projects;
CREATE POLICY "Users can create own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access projects" ON public.projects;
CREATE POLICY "Service role full access projects"
  ON public.projects FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_thread_project_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = NEW.project_id
      AND p.user_id = NEW.user_id
      AND p.archived = false
  ) THEN
    RAISE EXCEPTION 'Thread project must belong to thread owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_threads_project_owner ON public.threads;
CREATE TRIGGER validate_threads_project_owner
  BEFORE INSERT OR UPDATE OF user_id, project_id ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.validate_thread_project_owner();

CREATE INDEX IF NOT EXISTS projects_user_active_idx
  ON public.projects(user_id, archived, pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS threads_user_project_idx
  ON public.threads(user_id, project_id, updated_at DESC);

COMMENT ON TABLE public.projects IS 'User-owned project workspaces for thread organization and project-scoped runtime instructions.';
COMMENT ON COLUMN public.threads.project_id IS 'Optional project workspace this thread belongs to.';
COMMENT ON FUNCTION public.validate_thread_project_owner() IS 'Prevents assigning a thread to a project owned by another user.';
