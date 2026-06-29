-- ============================================================================
-- Polyphonic disk usage triage, compact version
--
-- Read-only. Designed for Supabase SQL Editor copy/paste.
-- Returns fewer than 70 rows so the useful rows fit in one copied result set.
--
-- Focus:
--   1. Current database size and WAL directory size.
--   2. Largest non-system tables across public/auth/storage/realtime/cron/pgmq.
--   3. Cron run-history growth, storage buckets, retention candidates, and bloat.
-- ============================================================================

WITH
database_and_wal AS (
  SELECT
    pg_database_size(current_database())::bigint AS database_bytes,
    COALESCE((SELECT SUM(size)::bigint FROM pg_ls_waldir()), 0)::bigint AS wal_bytes
),

relation_sizes AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS relation_name,
    c.reltuples::bigint AS estimated_rows,
    pg_total_relation_size(c.oid)::bigint AS total_bytes,
    pg_relation_size(c.oid)::bigint AS table_bytes,
    pg_indexes_size(c.oid)::bigint AS index_bytes,
    (
      pg_total_relation_size(c.oid)
      - pg_relation_size(c.oid)
      - pg_indexes_size(c.oid)
    )::bigint AS aux_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
),

top_tables AS (
  SELECT
    row_number() OVER (ORDER BY total_bytes DESC, schema_name, relation_name) AS row_num,
    *
  FROM relation_sizes
),

replication_slots AS (
  SELECT
    row_number() OVER (
      ORDER BY
        CASE
          WHEN restart_lsn IS NULL THEN 0
          ELSE GREATEST(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn), 0)
        END DESC,
        slot_name
    ) AS row_num,
    slot_name,
    active,
    plugin,
    slot_type,
    database,
    CASE
      WHEN restart_lsn IS NULL THEN 0::bigint
      ELSE GREATEST(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn), 0)::bigint
    END AS retained_wal_bytes
  FROM pg_replication_slots
),

cron_run_details AS (
  SELECT
    COUNT(*)::bigint AS total_rows,
    COUNT(*) FILTER (WHERE end_time < now() - interval '1 day')::bigint AS older_than_1d,
    COUNT(*) FILTER (WHERE end_time < now() - interval '7 days')::bigint AS older_than_7d,
    COUNT(*) FILTER (WHERE end_time < now() - interval '30 days')::bigint AS older_than_30d,
    MIN(start_time) AS oldest_run,
    MAX(start_time) AS newest_run
  FROM cron.job_run_details
),

storage_buckets_raw AS (
  SELECT
    bucket_id,
    COUNT(*)::bigint AS object_count,
    COALESCE(SUM(
      CASE
        WHEN metadata ? 'size' AND (metadata ->> 'size') ~ '^[0-9]+$' THEN (metadata ->> 'size')::bigint
        ELSE 0
      END
    ), 0)::bigint AS logical_object_bytes,
    MIN(created_at) AS oldest_object,
    MAX(created_at) AS newest_object
  FROM storage.objects
  GROUP BY bucket_id
),

storage_buckets AS (
  SELECT
    row_number() OVER (ORDER BY logical_object_bytes DESC, bucket_id) AS row_num,
    *
  FROM storage_buckets_raw
),

retention_candidates_raw AS (
  SELECT
    'cron.job_run_details'::text AS item,
    'run history older than 7 days'::text AS metric,
    older_than_7d AS rows,
    'total_rows=' || total_rows::text
      || ' | older_than_1d=' || older_than_1d::text
      || ' | older_than_30d=' || older_than_30d::text AS details
  FROM cron_run_details

  UNION ALL

  SELECT
    'public.activity_events'::text,
    'activity telemetry older than 30 days'::text,
    COUNT(*)::bigint,
    'Internal activity gate telemetry.'::text
  FROM public.activity_events
  WHERE created_at < now() - interval '30 days'

  UNION ALL

  SELECT
    'public.entity_activity_log'::text,
    'hidden info activity older than 90 days'::text,
    COUNT(*)::bigint,
    'Only rows hidden from user feed and severity=info.'::text
  FROM public.entity_activity_log
  WHERE created_at < now() - interval '90 days'
    AND surface_to_user = false
    AND severity = 'info'

  UNION ALL

  SELECT
    'public.client_error_log'::text,
    'client errors older than 14 days'::text,
    COUNT(*)::bigint,
    'Disposable operational telemetry.'::text
  FROM public.client_error_log
  WHERE created_at < now() - interval '14 days'

  UNION ALL

  SELECT
    'public.email_send_log'::text,
    'terminal email log rows older than 30 days'::text,
    COUNT(*)::bigint,
    'Operational email audit trail; keep recent support window.'::text
  FROM public.email_send_log
  WHERE created_at < now() - interval '30 days'
    AND status IN ('sent', 'failed', 'suppressed', 'bounced', 'complained', 'dlq')

  UNION ALL

  SELECT
    'public.account_portability_jobs'::text,
    'expired completed portability jobs'::text,
    COUNT(*)::bigint,
    'Review storage_path before pruning job rows.'::text
  FROM public.account_portability_jobs
  WHERE status IN ('completed', 'failed', 'rolled_back')
    AND COALESCE(expires_at, created_at + interval '14 days') < now()

  UNION ALL

  SELECT
    'public.account_portability_row_map'::text,
    'row maps attached to expired completed portability jobs'::text,
    COUNT(*)::bigint,
    'Clears automatically when parent job rows are pruned.'::text
  FROM public.account_portability_row_map m
  JOIN public.account_portability_jobs j ON j.id = m.job_id
  WHERE j.status IN ('completed', 'failed', 'rolled_back')
    AND COALESCE(j.expires_at, j.created_at + interval '14 days') < now()

  UNION ALL

  SELECT
    'public.chat_imports'::text,
    'failed or cancelled import metadata older than 30 days'::text,
    COUNT(*)::bigint,
    'Import metadata only; imported memories live elsewhere.'::text
  FROM public.chat_imports
  WHERE created_at < now() - interval '30 days'
    AND status IN ('failed', 'cancelled')
),

retention_candidates AS (
  SELECT
    row_number() OVER (ORDER BY rows DESC, item, metric) AS row_num,
    *
  FROM retention_candidates_raw
),

vacuum_hotspots AS (
  SELECT
    row_number() OVER (
      ORDER BY
        s.total_bytes DESC,
        t.n_dead_tup DESC,
        t.schemaname,
        t.relname
    ) AS row_num,
    format('%I.%I', t.schemaname, t.relname) AS item,
    t.n_live_tup,
    t.n_dead_tup,
    ROUND(100.0 * t.n_dead_tup / NULLIF(t.n_live_tup + t.n_dead_tup, 0), 2) AS dead_tuple_pct,
    t.last_autovacuum,
    t.last_vacuum,
    s.total_bytes
  FROM pg_stat_user_tables t
  JOIN relation_sizes s
    ON s.schema_name = t.schemaname
   AND s.relation_name = t.relname
  WHERE t.n_dead_tup > 0
)

SELECT
  '01_database_and_wal'::text AS section,
  1::bigint AS row_num,
  current_database()::text AS item,
  'database_size'::text AS metric,
  pg_size_pretty(database_bytes)::text AS value,
  ('wal_directory=' || pg_size_pretty(wal_bytes))::text AS details
FROM database_and_wal

UNION ALL

SELECT
  '01_database_and_wal'::text,
  2::bigint,
  'pg_wal directory'::text,
  'wal_directory_size'::text,
  pg_size_pretty(wal_bytes)::text,
  CASE
    WHEN wal_bytes > database_bytes THEN 'WAL is larger than the database; wait for checkpoint/recycling or inspect WAL settings.'
    WHEN wal_bytes > 1073741824 THEN 'WAL is over 1 GB; worth watching closely.'
    ELSE 'WAL is not currently the dominant disk user.'
  END::text
FROM database_and_wal

UNION ALL

SELECT
  '02_replication_slots'::text,
  row_num,
  slot_name::text,
  'retained_wal'::text,
  pg_size_pretty(retained_wal_bytes)::text,
  concat_ws(
    ' | ',
    'active=' || active::text,
    'plugin=' || COALESCE(plugin, 'none'),
    'slot_type=' || COALESCE(slot_type, 'none'),
    'database=' || COALESCE(database::text, 'none')
  )::text
FROM replication_slots

UNION ALL

SELECT
  '03_top_non_system_tables'::text,
  row_num,
  format('%I.%I', schema_name, relation_name)::text,
  'total_size'::text,
  pg_size_pretty(total_bytes)::text,
  concat(
    'estimated_rows=', estimated_rows,
    ' | table=', pg_size_pretty(table_bytes),
    ' | indexes=', pg_size_pretty(index_bytes),
    ' | toast_or_aux=', pg_size_pretty(aux_bytes)
  )::text
FROM top_tables
WHERE row_num <= 25

UNION ALL

SELECT
  '04_cron_run_history'::text,
  1::bigint,
  'cron.job_run_details'::text,
  'table_size'::text,
  pg_size_pretty(COALESCE(pg_total_relation_size(to_regclass('cron.job_run_details')), 0))::text,
  concat(
    'total_rows=', c.total_rows,
    ' | older_than_1d=', c.older_than_1d,
    ' | older_than_7d=', c.older_than_7d,
    ' | older_than_30d=', c.older_than_30d,
    ' | oldest=', COALESCE(c.oldest_run::text, 'none'),
    ' | newest=', COALESCE(c.newest_run::text, 'none')
  )::text
FROM cron_run_details c

UNION ALL

SELECT
  '05_storage_buckets'::text,
  row_num,
  bucket_id::text,
  'logical_object_size'::text,
  pg_size_pretty(logical_object_bytes)::text,
  concat_ws(
    ' | ',
    'object_count=' || object_count::text,
    'oldest=' || COALESCE(oldest_object::text, 'none'),
    'newest=' || COALESCE(newest_object::text, 'none')
  )::text
FROM storage_buckets
WHERE row_num <= 10

UNION ALL

SELECT
  '06_retention_candidates'::text,
  row_num,
  item,
  metric,
  rows::text,
  details
FROM retention_candidates

UNION ALL

SELECT
  '07_vacuum_hotspots'::text,
  row_num,
  item,
  'dead_tuple_pct'::text,
  COALESCE(dead_tuple_pct::text || '%', '0%')::text,
  concat_ws(
    ' | ',
    'size=' || pg_size_pretty(total_bytes),
    'live_rows=' || n_live_tup::text,
    'dead_rows=' || n_dead_tup::text,
    'last_autovacuum=' || COALESCE(last_autovacuum::text, 'never'),
    'last_vacuum=' || COALESCE(last_vacuum::text, 'never')
  )::text
FROM vacuum_hotspots
WHERE row_num <= 12

ORDER BY section, row_num, item;
