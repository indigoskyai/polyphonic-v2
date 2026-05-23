ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS landing_agent_id text;

COMMENT ON COLUMN public.user_settings.landing_agent_id IS
  'Agent id whose shape + name is the user''s default chat landing (null = Luca/polyphonic).';