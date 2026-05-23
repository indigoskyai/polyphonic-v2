-- Persist each user's chosen "landing agent" so that, once they adopt a
-- forged agent (via the genesis "say hello") or pick one in the agent
-- switcher, that agent's signature shape + name becomes the default landing
-- they see on login — until they change their mind (select another agent or
-- Luca). null = the standard Luca / "polyphonic" landing.
--
-- Nullable, no default, no backfill: existing rows stay null and render the
-- current landing exactly as before. Reads/writes ride existing user_settings
-- RLS (each user owns their own row), so no policy change is needed.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS landing_agent_id text;

COMMENT ON COLUMN public.user_settings.landing_agent_id IS
  'Agent id whose shape + name is the user''s default chat landing (null = Luca/polyphonic).';
