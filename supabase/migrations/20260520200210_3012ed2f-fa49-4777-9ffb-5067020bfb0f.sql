
-- Reap function: mark long-stuck imports as failed
CREATE OR REPLACE FUNCTION public.reap_stuck_imports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.chat_imports
     SET status = 'failed',
         pipeline_stage = 'stalled',
         completed_at = now()
   WHERE status = 'processing'
     AND created_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- One-shot cleanup of any currently zombie imports
SELECT public.reap_stuck_imports();

-- Schedule reaper every 5 minutes (idempotent via unschedule-if-exists pattern)
DO $$
BEGIN
  PERFORM cron.unschedule('reap-stuck-imports');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reap-stuck-imports',
  '*/5 * * * *',
  $$ SELECT public.reap_stuck_imports(); $$
);
