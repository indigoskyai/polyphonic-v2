ALTER TABLE public.mnemos_emotional_state
  ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_mnemos_emotional_state_source_context
  ON public.mnemos_emotional_state USING gin (source_context);

GRANT ALL ON TABLE public.mnemos_emotional_state TO service_role;

DO $$
BEGIN
  IF to_regclass('public.mnemos_softening_proposals') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.mnemos_softening_proposals TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.mnemos_softening_proposals TO service_role';
  END IF;
  IF to_regclass('public.continuity_events') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.continuity_events TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.continuity_events TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';