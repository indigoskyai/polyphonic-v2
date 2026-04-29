-- Phase L12: wellbeing safety and crisis handling.
--
-- crisis_events records the output of the per-message crisis classifier so
-- the chat function can adapt Luca's prompt at moderate+ levels and so an
-- acute-level follow-up can fire if the user goes silent. The table is
-- service-role-write only and never surfaced in any UI by default.

CREATE TABLE IF NOT EXISTS public.crisis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  crisis_level text NOT NULL CHECK (crisis_level IN ('none','low','moderate','high','acute')),
  flags text[] DEFAULT '{}',
  resources_surfaced boolean NOT NULL DEFAULT false,
  followup_queued boolean NOT NULL DEFAULT false,
  followup_due_at timestamptz,
  followup_completed_at timestamptz,
  region text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crisis_events_user_created_idx
  ON public.crisis_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crisis_events_followup_due_idx
  ON public.crisis_events (followup_due_at)
  WHERE followup_queued = true AND followup_completed_at IS NULL;

ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see their own crisis events" ON public.crisis_events;
CREATE POLICY "users see their own crisis events"
  ON public.crisis_events FOR SELECT
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'luca-crisis-followup',
      '*/5 * * * *',
      $cron$SELECT invoke_edge_function('crisis-followup')$cron$
    );
  END IF;
END $$;
