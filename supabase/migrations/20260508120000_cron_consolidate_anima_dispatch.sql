-- ============================================================================
-- Cron pattern consolidation (PRODUCTION_AUDIT.md §3.53)
--
-- Refactor the 7 autonomous-loop cron jobs from inline net.http_post() with
-- embedded service_role_key references into the shared invoke_edge_function()
-- helper.
--
-- Helper signature:
--   invoke_edge_function(function_name TEXT, payload JSONB DEFAULT '{}'::JSONB)
--
-- For dispatcher jobs the payload carries {"function":"anima-XXX"} so the
-- anima-dispatch worker fans out to per-user invocations of the named target.
--
-- Why this matters for launch readiness:
--   • Centralizes service_role_key handling — one read path through the helper
--     instead of 7 inline cron job bodies. Easier to rotate, easier to audit.
--   • Removes ad-hoc inline secret references from cron.job rows.
--   • Standardizes cron health observability — every dispatcher job now flows
--     through the same helper that logs into cron_health.
--
-- Originally scheduled inline by:
--   supabase/migrations/20260423230813_136b3f3f-2c00-4456-b338-8261b3c8fae1.sql
--
-- Safe to apply more than once: each unschedule guard checks cron.job first.
-- ============================================================================

-- 1. Unschedule existing inline jobs (guarded against repeat runs).
DO $$
DECLARE
  jobs TEXT[] := ARRAY[
    'luca-think',
    'luca-observe',
    'luca-emotional-drift',
    'luca-question',
    'luca-initiate',
    'luca-connect',
    'luca-dream'
  ];
  jobname TEXT;
BEGIN
  FOREACH jobname IN ARRAY jobs LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE cron.job.jobname = jobname) THEN
      PERFORM cron.unschedule(jobname);
    END IF;
  END LOOP;
END $$;

-- 2. Reschedule each through the shared helper. Cadences match the pre-existing
--    inline schedules in 20260423230813.
SELECT cron.schedule(
  'luca-think',
  '7 * * * *',
  $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-think"}'::jsonb)$$
);

SELECT cron.schedule(
  'luca-observe',
  '12 * * * *',
  $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-observe"}'::jsonb)$$
);

SELECT cron.schedule(
  'luca-emotional-drift',
  '18 * * * *',
  $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-emotional-state"}'::jsonb)$$
);

SELECT cron.schedule(
  'luca-question',
  '22 */3 * * *',
  $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-question"}'::jsonb)$$
);

SELECT cron.schedule(
  'luca-initiate',
  '33 */8 * * *',
  $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-initiate"}'::jsonb)$$
);

SELECT cron.schedule(
  'luca-connect',
  '40 */12 * * *',
  $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-connect"}'::jsonb)$$
);

SELECT cron.schedule(
  'luca-dream',
  '0 4 * * *',
  $$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-dream"}'::jsonb)$$
);
