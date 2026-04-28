-- Phase L8: user-facing scheduled tasks.

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

CREATE INDEX IF NOT EXISTS scheduled_tasks_due_idx
  ON public.scheduled_tasks (enabled, next_run_at)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS scheduled_tasks_user_created_idx
  ON public.scheduled_tasks (user_id, created_at DESC);

DROP TRIGGER IF EXISTS update_scheduled_tasks_updated_at ON public.scheduled_tasks;
CREATE TRIGGER update_scheduled_tasks_updated_at
  BEFORE UPDATE ON public.scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own scheduled tasks" ON public.scheduled_tasks;
CREATE POLICY "users manage their own scheduled tasks"
  ON public.scheduled_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'luca-scheduled-tasks',
      '* * * * *',
      $cron$SELECT invoke_edge_function('scheduled-task-run')$cron$
    );
  END IF;
END $$;
