-- Persist first-run onboarding state explicitly.
--
-- OAuth-created profiles already have display_name, so display_name is not a
-- reliable signal that a user has seen Polyphonic onboarding. Keep this state
-- on user_settings, which already has one row per user and user-owned RLS.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS interface_mode text NOT NULL DEFAULT 'guided'
    CHECK (interface_mode IN ('companion', 'guided', 'studio')),
  ADD COLUMN IF NOT EXISTS onboarding_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_settings.onboarding_completed_at IS
  'Set when the user completes or skips first-run onboarding.';

COMMENT ON COLUMN public.user_settings.interface_mode IS
  'Preferred shell mode chosen during onboarding: companion, guided, or studio.';

COMMENT ON COLUMN public.user_settings.onboarding_preferences IS
  'Raw onboarding choices used to shape the first Luca handoff and default interface.';
