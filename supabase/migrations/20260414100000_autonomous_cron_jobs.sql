-- =============================================================================
-- Autonomous Process Cron Jobs
-- Registers pg_cron jobs for Luca's autonomous inner life:
--   - Journal writing (daily reflection)
--   - Heartbeat (signal scanning every 2 hours)
--   - Memory decay (hourly)
--   - Memory consolidation + dreaming (every 6 hours)
-- =============================================================================

-- Ensure pg_cron and pg_net are available
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- Helper: invoke a Supabase edge function via pg_net
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invoke_edge_function(function_name TEXT, payload JSONB DEFAULT '{}'::JSONB)
RETURNS VOID AS $$
DECLARE
  project_url TEXT;
  service_key TEXT;
BEGIN
  -- Read from vault or app_config
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- Fallback: try app_config table
  IF service_key IS NULL THEN
    SELECT value INTO service_key
    FROM app_config
    WHERE key = 'service_role_key'
    LIMIT 1;
  END IF;

  SELECT value INTO project_url
  FROM app_config
  WHERE key = 'supabase_url'
  LIMIT 1;

  -- If we can't find the URL or key, log and exit gracefully
  IF project_url IS NULL OR service_key IS NULL THEN
    RAISE NOTICE 'Cannot invoke edge function %: missing project_url or service_key', function_name;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := payload
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- Cron Jobs
-- ---------------------------------------------------------------------------

-- Journal + emotional state + dream coordinator — runs every 4 hours
-- (journal-cron internally checks cooldowns and quiet hours for dreaming)
SELECT cron.schedule(
  'luca-journal-cron',
  '0 */4 * * *',
  $$SELECT invoke_edge_function('journal-cron')$$
);

-- Heartbeat — signal scanning + autonomous actions — runs every 2 hours
SELECT cron.schedule(
  'luca-heartbeat',
  '30 */2 * * *',
  $$SELECT invoke_edge_function('anima-heartbeat')$$
);

-- Mnemos memory decay — runs hourly
SELECT cron.schedule(
  'mnemos-decay',
  '15 * * * *',
  $$SELECT invoke_edge_function('mnemos-decay')$$
);

-- Mnemos consolidation + dreaming — runs every 6 hours
SELECT cron.schedule(
  'mnemos-consolidate',
  '0 */6 * * *',
  $$SELECT invoke_edge_function('mnemos-consolidate')$$
);
