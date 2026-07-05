CREATE TABLE IF NOT EXISTS public.mnemos_softening_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  engram_id uuid NOT NULL REFERENCES public.engrams(id) ON DELETE CASCADE,
  original_content text NOT NULL,
  proposed_content text NOT NULL,
  original_hash text NOT NULL,
  reason text,
  validator_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  source text NOT NULL DEFAULT 'mnemos-soften',
  dry_run boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'proposed',
  accepted_at timestamptz,
  rejected_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mnemos_softening_proposals
  DROP CONSTRAINT IF EXISTS mnemos_softening_proposals_status_check,
  ADD CONSTRAINT mnemos_softening_proposals_status_check
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'applied'));

CREATE INDEX IF NOT EXISTS idx_mnemos_softening_proposals_scope
  ON public.mnemos_softening_proposals (user_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mnemos_softening_proposals_engram
  ON public.mnemos_softening_proposals (engram_id, status);

GRANT SELECT ON TABLE public.mnemos_softening_proposals TO authenticated;
GRANT ALL ON TABLE public.mnemos_softening_proposals TO service_role;

ALTER TABLE public.mnemos_softening_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own softening proposals" ON public.mnemos_softening_proposals;
CREATE POLICY "Users can view own softening proposals"
  ON public.mnemos_softening_proposals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access softening proposals" ON public.mnemos_softening_proposals;
CREATE POLICY "Service role full access softening proposals"
  ON public.mnemos_softening_proposals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_mnemos_softening_proposals_updated_at ON public.mnemos_softening_proposals;
CREATE TRIGGER update_mnemos_softening_proposals_updated_at
  BEFORE UPDATE ON public.mnemos_softening_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.continuity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  thread_id uuid,
  event_type text NOT NULL,
  subject_type text,
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.continuity_events
  DROP CONSTRAINT IF EXISTS continuity_events_event_type_check,
  ADD CONSTRAINT continuity_events_event_type_check
    CHECK (event_type IN (
      'recall_hit', 'recall_miss', 'reteach_detected',
      'belief_formed', 'belief_revised', 'schema_formed', 'schema_revised',
      'digest_accepted', 'digest_rejected', 'digest_distilled',
      'softening_proposed', 'softening_applied',
      'encode_queued', 'encode_skipped', 'encode_encoded', 'encode_failed'
    ));

CREATE INDEX IF NOT EXISTS idx_continuity_events_scope_time
  ON public.continuity_events (user_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_continuity_events_type_time
  ON public.continuity_events (event_type, created_at DESC);

GRANT SELECT ON TABLE public.continuity_events TO authenticated;
GRANT ALL ON TABLE public.continuity_events TO service_role;

ALTER TABLE public.continuity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own continuity events" ON public.continuity_events;
CREATE POLICY "Users can view own continuity events"
  ON public.continuity_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access continuity events" ON public.continuity_events;
CREATE POLICY "Service role full access continuity events"
  ON public.continuity_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';