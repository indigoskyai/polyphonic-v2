-- Keep Supabase Cron's run-history table bounded.
--
-- cron.job_run_details records every pg_cron run. Polyphonic has many background
-- jobs, so this table can grow quickly and consume database disk unless it has
-- an explicit retention window.

CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details(
  p_retention interval DEFAULT interval '7 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_retention < interval '1 day' THEN
    RAISE EXCEPTION 'p_retention must be at least 1 day';
  END IF;

  DELETE FROM cron.job_run_details
   WHERE end_time IS NOT NULL
     AND end_time < now() - p_retention;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.prune_cron_job_run_details(interval) IS
  'Prunes completed rows from cron.job_run_details so pg_cron history cannot grow without bound.';

REVOKE EXECUTE ON FUNCTION public.prune_cron_job_run_details(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_cron_job_run_details(interval) TO service_role;

SELECT cron.unschedule('prune-cron-job-run-details')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-cron-job-run-details');

SELECT cron.schedule(
  'prune-cron-job-run-details',
  '17 2 * * *',
  $$SELECT public.prune_cron_job_run_details('7 days'::interval)$$
);
