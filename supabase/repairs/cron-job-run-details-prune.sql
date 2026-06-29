-- ============================================================================
-- One-time repair: prune old Supabase Cron run history
--
-- Run the preview first. Only run the pruning section after confirming that
-- cron.job_run_details is a meaningful disk user.
--
-- This affects Supabase Cron history only. It does not touch user data, auth
-- records, messages, memories, storage objects, or app content.
-- ============================================================================

-- Preview current size and candidate rows.
SELECT
  'preview' AS section,
  pg_size_pretty(pg_total_relation_size('cron.job_run_details'::regclass)) AS table_size,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE end_time < now() - interval '1 day') AS older_than_1d,
  COUNT(*) FILTER (WHERE end_time < now() - interval '7 days') AS older_than_7d,
  COUNT(*) FILTER (WHERE end_time < now() - interval '30 days') AS older_than_30d,
  MIN(start_time) AS oldest_run,
  MAX(start_time) AS newest_run
FROM cron.job_run_details;

-- Step 1: pruning section.
-- Expect Supabase SQL Editor to show a destructive-operation confirmation.
-- Run this only after the preview confirms the table is worth pruning.
SET statement_timeout = '5min';

DELETE FROM cron.job_run_details
 WHERE end_time IS NOT NULL
   AND end_time < now() - interval '7 days';

-- Step 2: run this next command by itself, as a separate SQL Editor run.
-- It rewrites and compacts only Supabase Cron's history table. It takes an
-- exclusive lock on cron.job_run_details while it runs, but does not lock user
-- tables such as messages, memories, profiles, auth users, or storage objects.
--
--   VACUUM (FULL, ANALYZE) cron.job_run_details;

-- Verify remaining size and rows.
SELECT
  'after_prune' AS section,
  pg_size_pretty(pg_total_relation_size('cron.job_run_details'::regclass)) AS table_size,
  COUNT(*) AS remaining_rows,
  MIN(start_time) AS oldest_remaining_run,
  MAX(start_time) AS newest_remaining_run
FROM cron.job_run_details;
