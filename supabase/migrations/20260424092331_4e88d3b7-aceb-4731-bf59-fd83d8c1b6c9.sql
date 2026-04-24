-- Add pinned column to memories table if not exists
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- Create memory_candidates table
CREATE TABLE IF NOT EXISTS public.memory_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  memory_type text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  candidate_type text NOT NULL CHECK (candidate_type IN ('pin', 'standard')),
  rationale text NOT NULL,
  source jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pinned', 'committed', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_candidates_user_status_created
  ON public.memory_candidates (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_candidates_pending
  ON public.memory_candidates (status)
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.memory_candidates ENABLE ROW LEVEL SECURITY;

-- Owner full access
CREATE POLICY "Users can access own memory candidates"
  ON public.memory_candidates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access memory_candidates"
  ON public.memory_candidates
  FOR ALL
  USING (auth.role() = 'service_role');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_candidates;

-- Auto-commit function for unreviewed candidates after 48h
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
    SELECT id, user_id, content, memory_type, confidence, source
    FROM public.memory_candidates
    WHERE status = 'pending'
      AND created_at < (now() - interval '48 hours')
    LIMIT 200
  LOOP
    INSERT INTO public.memories (
      user_id, content, memory_type, confidence, provenance
    ) VALUES (
      v_candidate.user_id,
      v_candidate.content,
      v_candidate.memory_type,
      LEAST(GREATEST(v_candidate.confidence * 0.7, 0), 1),
      COALESCE(v_candidate.source, '{}'::jsonb) || jsonb_build_object('auto_committed', true, 'candidate_id', v_candidate.id)
    );

    UPDATE public.memory_candidates
    SET status = 'committed', reviewed_at = now()
    WHERE id = v_candidate.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Schedule pg_cron job: every 15 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('memory-candidate-auto-commit')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'memory-candidate-auto-commit');

    PERFORM cron.schedule(
      'memory-candidate-auto-commit',
      '*/15 * * * *',
      $cron$ SELECT public.auto_commit_stale_memory_candidates(); $cron$
    );
  END IF;
END $$;