DROP POLICY IF EXISTS "Admins can read cron health" ON public.cron_health;
DROP POLICY IF EXISTS "Authenticated can read cron health" ON public.cron_health;

CREATE POLICY "Authenticated can read cron health"
  ON public.cron_health
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.cron_health IS
  'One row per cron job. SELECT exposed to authenticated for the in-app cron health surface (/settings/cron-health). Writes happen via SECURITY DEFINER record_cron_run() called from edge functions; no user-facing INSERT/UPDATE/DELETE policies by design.';