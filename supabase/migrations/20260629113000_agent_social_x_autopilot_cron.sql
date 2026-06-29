-- Run autonomous X posting checks in the background.
-- The worker enforces each channel's policy, cadence, approval mode, and credit gates.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (
       SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'invoke_edge_function'
     ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'agent-social-x-autopilot';

    PERFORM cron.schedule(
      'agent-social-x-autopilot',
      '*/5 * * * *',
      $cron$SELECT public.invoke_edge_function(
        'agent-social-x-autopilot',
        '{"action":"run_due","limit":12}'::jsonb
      )$cron$
    );
  END IF;
END $$;
