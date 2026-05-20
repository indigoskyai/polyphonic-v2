-- Force ensemble OFF on existing rows. The composer toggle in PolyphonicChat
-- is the sole source of truth; this clears any stale `true` values that were
-- silently auto-arming the lock.
UPDATE public.user_settings
SET multi_model_enabled = false
WHERE multi_model_enabled IS DISTINCT FROM false;