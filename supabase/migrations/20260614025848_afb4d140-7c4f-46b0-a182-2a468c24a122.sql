ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS runtime_mode TEXT NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS selected_model TEXT,
  ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS continuity_summary TEXT;

DO $$
BEGIN
  ALTER TABLE public.threads
    ADD CONSTRAINT threads_runtime_mode_check
    CHECK (runtime_mode IN ('classic', 'agent'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS threads_user_runtime_updated_idx
  ON public.threads(user_id, runtime_mode, updated_at DESC);

COMMENT ON COLUMN public.threads.runtime_mode IS
  'classic = direct model chat with quiet Mnemos continuity; agent = full Luca/custom-agent runtime.';
COMMENT ON COLUMN public.threads.selected_model IS
  'OpenRouter model selected for Classic Chat turns on this thread.';
COMMENT ON COLUMN public.threads.memory_enabled IS
  'Whether quiet continuity may be loaded/written for this thread.';
COMMENT ON COLUMN public.threads.continuity_summary IS
  'Reserved rolling thread summary for Classic Chat continuity.';