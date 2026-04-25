ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS agent_id text NOT NULL DEFAULT 'luca';

CREATE INDEX IF NOT EXISTS idx_threads_user_agent
  ON public.threads(user_id, agent_id);

-- Backfill (column default already handles new rows; ensure existing rows are non-null)
UPDATE public.threads SET agent_id = 'luca' WHERE agent_id IS NULL;