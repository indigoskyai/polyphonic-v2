-- ============================================================================
-- Polyphonic guarded disk-retention cleanup
--
-- IMPORTANT:
--   - This script defaults to DRY RUN. It reports candidate rows but does not
--     delete anything until perform_cleanup is changed to true below.
--   - It intentionally avoids durable user history: messages, memories,
--     engrams, beliefs, journal_entries, hypomnema_entry, profile data, and
--     generated content are not touched.
--   - Run supabase/audits/disk-usage-diagnostics.sql first and save the output.
--   - After any large enabled delete, run VACUUM (ANALYZE) on affected tables.
--     Physical disk shrink may require pg_repack or VACUUM FULL in maintenance.
-- ============================================================================

CREATE TEMP TABLE IF NOT EXISTS disk_cleanup_report (
  table_name text,
  candidate text,
  retention_window text,
  rows_matched bigint,
  action_taken text,
  note text
) ON COMMIT DROP;

TRUNCATE disk_cleanup_report;

DO $$
DECLARE
  perform_cleanup boolean := false; -- CHANGE TO true ONLY AFTER REVIEWING THE DRY RUN.

  client_error_rows bigint := 0;
  email_log_rows bigint := 0;
  activity_event_rows bigint := 0;
  hidden_entity_activity_rows bigint := 0;
  failed_import_rows bigint := 0;
  expired_portability_job_rows bigint := 0;
BEGIN
  IF to_regclass('public.client_error_log') IS NOT NULL THEN
    SELECT COUNT(*) INTO client_error_rows
    FROM public.client_error_log
    WHERE created_at < now() - interval '14 days';

    IF perform_cleanup THEN
      DELETE FROM public.client_error_log
      WHERE created_at < now() - interval '14 days';
    END IF;

    INSERT INTO disk_cleanup_report VALUES (
      'client_error_log',
      'client errors older than 14 days',
      '14 days',
      client_error_rows,
      CASE WHEN perform_cleanup THEN 'deleted' ELSE 'dry_run_only' END,
      'Disposable operational telemetry.'
    );
  END IF;

  IF to_regclass('public.email_send_log') IS NOT NULL THEN
    SELECT COUNT(*) INTO email_log_rows
    FROM public.email_send_log
    WHERE created_at < now() - interval '30 days'
      AND status IN ('sent', 'failed', 'suppressed', 'bounced', 'complained', 'dlq');

    IF perform_cleanup THEN
      DELETE FROM public.email_send_log
      WHERE created_at < now() - interval '30 days'
        AND status IN ('sent', 'failed', 'suppressed', 'bounced', 'complained', 'dlq');
    END IF;

    INSERT INTO disk_cleanup_report VALUES (
      'email_send_log',
      'terminal email send rows older than 30 days',
      '30 days',
      email_log_rows,
      CASE WHEN perform_cleanup THEN 'deleted' ELSE 'dry_run_only' END,
      'Keeps recent email audit trail for support.'
    );
  END IF;

  IF to_regclass('public.activity_events') IS NOT NULL THEN
    SELECT COUNT(*) INTO activity_event_rows
    FROM public.activity_events
    WHERE created_at < now() - interval '90 days';

    IF perform_cleanup THEN
      DELETE FROM public.activity_events
      WHERE created_at < now() - interval '90 days';
    END IF;

    INSERT INTO disk_cleanup_report VALUES (
      'activity_events',
      'low-level activity gate events older than 90 days',
      '90 days',
      activity_event_rows,
      CASE WHEN perform_cleanup THEN 'deleted' ELSE 'dry_run_only' END,
      'Internal gate telemetry; not the user-facing activity feed.'
    );
  END IF;

  IF to_regclass('public.entity_activity_log') IS NOT NULL THEN
    SELECT COUNT(*) INTO hidden_entity_activity_rows
    FROM public.entity_activity_log
    WHERE created_at < now() - interval '90 days'
      AND surface_to_user = false
      AND severity = 'info';

    IF perform_cleanup THEN
      DELETE FROM public.entity_activity_log
      WHERE created_at < now() - interval '90 days'
        AND surface_to_user = false
        AND severity = 'info';
    END IF;

    INSERT INTO disk_cleanup_report VALUES (
      'entity_activity_log',
      'hidden info activity older than 90 days',
      '90 days',
      hidden_entity_activity_rows,
      CASE WHEN perform_cleanup THEN 'deleted' ELSE 'dry_run_only' END,
      'Only hidden info-severity rows; surfaced/notable/important entries are preserved.'
    );
  END IF;

  IF to_regclass('public.chat_imports') IS NOT NULL THEN
    SELECT COUNT(*) INTO failed_import_rows
    FROM public.chat_imports
    WHERE created_at < now() - interval '30 days'
      AND status IN ('failed', 'cancelled');

    IF perform_cleanup THEN
      DELETE FROM public.chat_imports
      WHERE created_at < now() - interval '30 days'
        AND status IN ('failed', 'cancelled');
    END IF;

    INSERT INTO disk_cleanup_report VALUES (
      'chat_imports',
      'failed/cancelled import metadata older than 30 days',
      '30 days',
      failed_import_rows,
      CASE WHEN perform_cleanup THEN 'deleted' ELSE 'dry_run_only' END,
      'Import metadata only; imported memory rows are separate.'
    );
  END IF;

  IF to_regclass('public.account_portability_jobs') IS NOT NULL THEN
    SELECT COUNT(*) INTO expired_portability_job_rows
    FROM public.account_portability_jobs
    WHERE status IN ('completed', 'failed', 'rolled_back')
      AND COALESCE(expires_at, created_at + interval '14 days') < now();

    -- This only deletes database job/row-map metadata. If storage_path is set,
    -- delete the referenced account-portability Storage objects through the
    -- Storage API/dashboard first so the actual bucket bytes are removed too.
    IF perform_cleanup THEN
      DELETE FROM public.account_portability_jobs
      WHERE status IN ('completed', 'failed', 'rolled_back')
        AND COALESCE(expires_at, created_at + interval '14 days') < now();
    END IF;

    INSERT INTO disk_cleanup_report VALUES (
      'account_portability_jobs',
      'expired/completed portability job rows',
      'expires_at or 14 days',
      expired_portability_job_rows,
      CASE WHEN perform_cleanup THEN 'deleted' ELSE 'dry_run_only' END,
      'Delete referenced account-portability Storage objects first when storage_path is present.'
    );
  END IF;

  RAISE NOTICE 'perform_cleanup=%', perform_cleanup;
  RAISE NOTICE 'client_error_log rows older than 14d: %', client_error_rows;
  RAISE NOTICE 'email_send_log terminal rows older than 30d: %', email_log_rows;
  RAISE NOTICE 'activity_events rows older than 90d: %', activity_event_rows;
  RAISE NOTICE 'hidden info entity_activity_log rows older than 90d: %', hidden_entity_activity_rows;
  RAISE NOTICE 'failed/cancelled chat_imports older than 30d: %', failed_import_rows;
  RAISE NOTICE 'expired/completed account_portability_jobs older than retention window: %', expired_portability_job_rows;
END $$;

SELECT *
FROM disk_cleanup_report
ORDER BY rows_matched DESC, table_name;

-- Run these manually after enabling cleanup and confirming the delete counts.
-- These do not generally return physical disk to the cloud volume, but they let
-- Postgres reuse freed pages and update query planning statistics.
--
-- VACUUM (ANALYZE) public.client_error_log;
-- VACUUM (ANALYZE) public.email_send_log;
-- VACUUM (ANALYZE) public.activity_events;
-- VACUUM (ANALYZE) public.entity_activity_log;
-- VACUUM (ANALYZE) public.chat_imports;
-- VACUUM (ANALYZE) public.account_portability_jobs;
-- VACUUM (ANALYZE) public.account_portability_row_map;
