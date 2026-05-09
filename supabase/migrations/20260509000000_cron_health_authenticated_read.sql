-- ============================================================================
-- Cron health surface — relax SELECT to authenticated
-- (PRODUCTION_LAUNCH_CHECKLIST.md Operations#cron-health-surface)
--
-- The cron_health table was created in 20260502233659 with admin-only SELECT.
-- For launch we expose it to authenticated users so the in-app cron health
-- surface (/settings/cron-health) can render without bootstrapping the role
-- system. The data is operational metadata (job names, run timestamps,
-- duration, error count, latest error string) — no user PII, no secrets.
--
-- Multi-tenant readiness note: when Polyphonic moves beyond single-operator
-- deploys, this should retighten to admin-only via has_role(auth.uid(),
-- 'admin') and the cron health page should hide for non-admin users. For
-- the current operator-as-user model, authenticated read is the right scope.
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read cron health" ON public.cron_health;
DROP POLICY IF EXISTS "Authenticated can read cron health" ON public.cron_health;

CREATE POLICY "Authenticated can read cron health"
  ON public.cron_health
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.cron_health IS
  'One row per cron job. SELECT exposed to authenticated for the in-app cron health surface (/settings/cron-health). Writes happen via SECURITY DEFINER record_cron_run() called from edge functions; no user-facing INSERT/UPDATE/DELETE policies by design.';
