-- Idempotent: prune cron.job_run_details to a 7-day retention window.
CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days'
     OR (end_time IS NULL AND start_time < now() - interval '7 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_cron_job_run_details() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_cron_job_run_details() TO service_role;

-- Schedule daily at 03:30 UTC. Unschedule any prior version first for idempotency.
DO $$
BEGIN
  PERFORM cron.unschedule('prune-cron-job-run-details')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'prune-cron-job-run-details'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'prune-cron-job-run-details',
  '30 3 * * *',
  $$SELECT public.prune_cron_job_run_details();$$
);
