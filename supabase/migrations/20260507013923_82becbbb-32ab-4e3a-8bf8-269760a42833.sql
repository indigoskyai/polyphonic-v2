ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_threads_user_starred ON public.threads (user_id, starred) WHERE starred;
CREATE INDEX IF NOT EXISTS idx_threads_user_archived ON public.threads (user_id, archived);