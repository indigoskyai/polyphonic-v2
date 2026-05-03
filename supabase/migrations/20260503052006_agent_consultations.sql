-- Agent-to-agent consultations — Phase 1.
--
-- When Luca consults Anima (or later Vektor) for a perspective during a chat
-- turn, the back-and-forth is logged here so:
--   - the user can see the dialogue in a side drawer (live via realtime),
--   - the consultation is auditable (which agent, what was asked, what came back),
--   - future runtime work can re-load past consultations as context.
--
-- Status flow: pending → completed | failed.

CREATE TABLE IF NOT EXISTS public.agent_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  parent_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  from_agent text NOT NULL DEFAULT 'luca',
  to_agent text NOT NULL,
  question text NOT NULL,
  response text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  model_used text,
  tokens_used integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_consultations_thread_idx
  ON public.agent_consultations (parent_thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_consultations_user_created_idx
  ON public.agent_consultations (user_id, created_at DESC);

ALTER TABLE public.agent_consultations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see their own consultations" ON public.agent_consultations;
CREATE POLICY "users see their own consultations"
  ON public.agent_consultations FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.agent_consultations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_consultations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_consultations';
  END IF;
END $$;
