-- Phase L9: subagent runtime dispatch.
--
-- Adds the subagent_tasks table for fire-and-forget background work that Luca
-- delegates to a focused execution context, plus the messages.kind values that
-- the runner needs to honestly post results back into a parent thread.

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

CREATE INDEX IF NOT EXISTS subagent_tasks_user_created_idx
  ON public.subagent_tasks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subagent_tasks_parent_thread_idx
  ON public.subagent_tasks (parent_thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subagent_tasks_active_idx
  ON public.subagent_tasks (status, created_at)
  WHERE status IN ('pending', 'running');

ALTER TABLE public.subagent_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see their own subagent tasks" ON public.subagent_tasks;
CREATE POLICY "users see their own subagent tasks"
  ON public.subagent_tasks FOR SELECT
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subagent_tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.subagent_tasks';
  END IF;
END $$;

-- Phase L8 inserted scheduled-task message rows with kind values that the
-- existing messages_kind_check rejected. Widen the constraint so scheduled
-- runs and Phase L9 subagent reports persist honestly.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_kind_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_check
  CHECK (
    kind IS NULL
    OR kind IN (
      'text',
      'permission_request',
      'agent_error',
      'scheduled_task',
      'scheduled_task_result',
      'subagent_report'
    )
  );
