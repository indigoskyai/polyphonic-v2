-- Mnemos E2E repair follow-up:
-- 1. expose new review/ledger tables through PostgREST for authenticated reads,
-- 2. tag Mnemos emotional snapshots so verifier cleanup can be precise.

ALTER TABLE public.mnemos_emotional_state
  ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_mnemos_emotional_state_source_context
  ON public.mnemos_emotional_state USING gin (source_context);

GRANT SELECT ON TABLE public.mnemos_softening_proposals TO authenticated;
GRANT SELECT ON TABLE public.continuity_events TO authenticated;

GRANT ALL ON TABLE public.mnemos_softening_proposals TO service_role;
GRANT ALL ON TABLE public.continuity_events TO service_role;
GRANT ALL ON TABLE public.mnemos_emotional_state TO service_role;

NOTIFY pgrst, 'reload schema';
