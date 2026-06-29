-- ============================================================================
-- Polyphonic disk usage diagnostics
--
-- Read-only single-result version for Supabase SQL Editor.
-- Paste this whole file and run it once. The output is one table with:
--   section | row_num | item | metric | value | details
--
-- Purpose:
--   1. Identify which tables, indexes, buckets, and WAL are using disk.
--   2. Spot bloat/autovacuum lag before changing retention.
--   3. Surface safe retention candidates for later review.
--
-- Notes:
--   - Supabase's "Data disk" includes Postgres data, indexes, TOAST, and WAL.
--   - Row pruning first creates reusable space inside Postgres; reclaiming
--     physical disk may require pg_repack or VACUUM FULL in a maintenance window.
-- ============================================================================

WITH
database_size AS (
  SELECT
    '01_database_size'::text AS section,
    1::bigint AS row_num,
    current_database()::text AS item,
    'database_size'::text AS metric,
    pg_size_pretty(pg_database_size(current_database()))::text AS value,
    'Total current Postgres database size.'::text AS details
),

replication_slots_raw AS (
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
    plugin,
    slot_type,
    active,
    database,
    restart_lsn,
    confirmed_flush_lsn,
    CASE
      WHEN restart_lsn IS NULL THEN 0::bigint
      ELSE GREATEST(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn), 0)::bigint
    END AS retained_wal_bytes
  FROM pg_replication_slots
),

replication_slots AS (
  SELECT
    '02_wal_retained_by_replication_slots'::text AS section,
    row_num,
    slot_name::text AS item,
    'retained_wal'::text AS metric,
    pg_size_pretty(retained_wal_bytes)::text AS value,
    concat_ws(
      ' | ',
      'active=' || active::text,
      'plugin=' || COALESCE(plugin, 'none'),
      'slot_type=' || COALESCE(slot_type, 'none'),
      'database=' || COALESCE(database::text, 'none'),
      'restart_lsn=' || COALESCE(restart_lsn::text, 'none'),
      'confirmed_flush_lsn=' || COALESCE(confirmed_flush_lsn::text, 'none'),
      CASE
        WHEN active THEN 'slot is active'
        WHEN restart_lsn IS NULL THEN 'slot has no restart_lsn'
        ELSE 'inactive slot may retain WAL'
      END
    )::text AS details
  FROM replication_slots_raw
),

relations_ranked AS (
  SELECT
    row_number() OVER (ORDER BY pg_total_relation_size(c.oid) DESC, n.nspname, c.relname) AS row_num,
    n.nspname AS schema_name,
    c.relname AS relation_name,
    CASE c.relkind
      WHEN 'r' THEN 'table'
      WHEN 'i' THEN 'index'
      WHEN 'm' THEN 'materialized_view'
      WHEN 't' THEN 'toast'
      ELSE c.relkind::text
    END AS relation_kind,
    pg_total_relation_size(c.oid) AS total_bytes,
    pg_relation_size(c.oid) AS main_bytes,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid) AS aux_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'storage', 'pgmq')
    AND c.relkind IN ('r', 'i', 'm', 't')
),

top_relations AS (
  SELECT
    '03_top_relations_by_total_size'::text AS section,
    row_num,
    format('%I.%I', schema_name, relation_name)::text AS item,
    (relation_kind || '_total_size')::text AS metric,
    pg_size_pretty(total_bytes)::text AS value,
    concat(
      'main=', pg_size_pretty(main_bytes),
      ' | indexes=', pg_size_pretty(index_bytes),
      ' | toast_or_aux=', pg_size_pretty(aux_bytes)
    )::text AS details
  FROM relations_ranked
  WHERE row_num <= 60
),

vacuum_ranked AS (
  SELECT
    row_number() OVER (
      ORDER BY
        n_dead_tup DESC,
        COALESCE(last_autovacuum, last_vacuum, 'epoch'::timestamptz) ASC NULLS FIRST,
        schemaname,
        relname
    ) AS row_num,
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_tuple_pct,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    vacuum_count,
    autovacuum_count,
    analyze_count,
    autoanalyze_count
  FROM pg_stat_user_tables
),

vacuum_health AS (
  SELECT
    '04_public_table_bloat_and_vacuum_health'::text AS section,
    row_num,
    format('%I.%I', schemaname, relname)::text AS item,
    'dead_tuple_pct'::text AS metric,
    COALESCE(dead_tuple_pct::text || '%', '0%')::text AS value,
    concat_ws(
      ' | ',
      'live_rows=' || n_live_tup::text,
      'dead_rows=' || n_dead_tup::text,
      'last_autovacuum=' || COALESCE(last_autovacuum::text, 'never'),
      'last_vacuum=' || COALESCE(last_vacuum::text, 'never'),
      'last_autoanalyze=' || COALESCE(last_autoanalyze::text, 'never'),
      'autovacuum_count=' || autovacuum_count::text,
      'vacuum_count=' || vacuum_count::text,
      'autoanalyze_count=' || autoanalyze_count::text,
      'analyze_count=' || analyze_count::text
    )::text AS details
  FROM vacuum_ranked
  WHERE row_num <= 80
),

growth_ranked AS (
  SELECT
    row_number() OVER (ORDER BY pg_total_relation_size(c.oid) DESC, c.relname) AS row_num,
    CASE c.relname
      WHEN 'messages' THEN 'conversation'
      WHEN 'threads' THEN 'conversation'
      WHEN 'artifacts' THEN 'conversation'
      WHEN 'memories' THEN 'memory'
      WHEN 'memory_events' THEN 'memory'
      WHEN 'memory_candidates' THEN 'memory'
      WHEN 'engrams' THEN 'mnemos'
      WHEN 'engram_archive' THEN 'mnemos'
      WHEN 'connections' THEN 'mnemos'
      WHEN 'beliefs' THEN 'mnemos'
      WHEN 'hypomnema_entry' THEN 'mnemos'
      WHEN 'mnemos_digests' THEN 'mnemos'
      WHEN 'journal_entries' THEN 'inner_life'
      WHEN 'thought_stream' THEN 'inner_life'
      WHEN 'thought_initiations' THEN 'inner_life'
      WHEN 'entity_activity_log' THEN 'telemetry'
      WHEN 'activity_events' THEN 'telemetry'
      WHEN 'client_error_log' THEN 'telemetry'
      WHEN 'email_send_log' THEN 'email'
      WHEN 'account_portability_jobs' THEN 'portability'
      WHEN 'account_portability_row_map' THEN 'portability'
      WHEN 'chat_imports' THEN 'imports'
      WHEN 'checkpoint_files' THEN 'checkpoints'
      WHEN 'checkpoints' THEN 'checkpoints'
      ELSE 'other'
    END AS family,
    c.relname AS table_name,
    c.reltuples::bigint AS estimated_rows,
    pg_total_relation_size(c.oid) AS total_bytes,
    pg_relation_size(c.oid) AS table_bytes,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid) AS aux_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = ANY (ARRAY[
      'messages', 'threads', 'artifacts',
      'memories', 'memory_events', 'memory_candidates',
      'engrams', 'engram_archive', 'connections', 'beliefs',
      'hypomnema_entry', 'mnemos_digests',
      'journal_entries', 'thought_stream', 'thought_initiations',
      'entity_activity_log', 'activity_events', 'client_error_log',
      'email_send_log',
      'account_portability_jobs', 'account_portability_row_map',
      'chat_imports',
      'checkpoint_files', 'checkpoints'
    ])
),

growth_tables AS (
  SELECT
    '05_polyphonic_growth_tables'::text AS section,
    row_num,
    table_name::text AS item,
    (family || '_total_size')::text AS metric,
    pg_size_pretty(total_bytes)::text AS value,
    concat(
      'estimated_rows=', estimated_rows,
      ' | table=', pg_size_pretty(table_bytes),
      ' | indexes=', pg_size_pretty(index_bytes),
      ' | toast_or_aux=', pg_size_pretty(aux_bytes)
    )::text AS details
  FROM growth_ranked
),

storage_bucket_ranked AS (
  SELECT
    row_number() OVER (
      ORDER BY
        SUM(
          CASE
            WHEN metadata ? 'size' AND (metadata ->> 'size') ~ '^[0-9]+$' THEN (metadata ->> 'size')::bigint
            ELSE 0
          END
        ) DESC NULLS LAST,
        bucket_id
    ) AS row_num,
    bucket_id,
    COUNT(*) AS object_count,
    SUM(
      CASE
        WHEN metadata ? 'size' AND (metadata ->> 'size') ~ '^[0-9]+$' THEN (metadata ->> 'size')::bigint
        ELSE 0
      END
    )::bigint AS logical_object_bytes,
    MIN(created_at) AS oldest_object,
    MAX(created_at) AS newest_object
  FROM storage.objects
  GROUP BY bucket_id
),

storage_bucket_sizes AS (
  SELECT
    '06_storage_bucket_object_sizes'::text AS section,
    row_num,
    bucket_id::text AS item,
    'logical_object_size'::text AS metric,
    pg_size_pretty(logical_object_bytes)::text AS value,
    concat_ws(
      ' | ',
      'object_count=' || object_count::text,
      'oldest=' || COALESCE(oldest_object::text, 'none'),
      'newest=' || COALESCE(newest_object::text, 'none')
    )::text AS details
  FROM storage_bucket_ranked
),

storage_table_sizes AS (
  SELECT
    '07_storage_metadata_table_sizes'::text AS section,
    1::bigint AS row_num,
    'storage.objects'::text AS item,
    'table_size'::text AS metric,
    pg_size_pretty(COALESCE(pg_total_relation_size(to_regclass('storage.objects')), 0))::text AS value,
    'Storage object metadata table inside Postgres.'::text AS details

  UNION ALL

  SELECT
    '07_storage_metadata_table_sizes'::text AS section,
    2::bigint AS row_num,
    'storage.buckets'::text AS item,
    'table_size'::text AS metric,
    pg_size_pretty(COALESCE(pg_total_relation_size(to_regclass('storage.buckets')), 0))::text AS value,
    'Storage bucket metadata table inside Postgres.'::text AS details
),

pgmq_ranked AS (
  SELECT
    row_number() OVER (ORDER BY pg_total_relation_size(c.oid) DESC, n.nspname, c.relname) AS row_num,
    n.nspname AS schema_name,
    c.relname AS relation_name,
    c.reltuples::bigint AS estimated_rows,
    pg_total_relation_size(c.oid) AS total_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'pgmq'
    AND c.relkind = 'r'
),

pgmq_sizes AS (
  SELECT
    '08_pgmq_queue_table_sizes'::text AS section,
    row_num,
    format('%I.%I', schema_name, relation_name)::text AS item,
    'queue_table_size'::text AS metric,
    pg_size_pretty(total_bytes)::text AS value,
    ('estimated_rows=' || estimated_rows::text)::text AS details
  FROM pgmq_ranked
),

retention_candidates_raw AS (
  SELECT
    'client_error_log'::text AS table_name,
    'client errors older than 14 days'::text AS candidate,
    '14 days'::text AS retention_window,
    COUNT(*)::bigint AS rows,
    'Disposable operational telemetry; first review target.'::text AS note
  FROM public.client_error_log
  WHERE created_at < now() - interval '14 days'

  UNION ALL

  SELECT
    'email_send_log'::text,
    'terminal email send rows older than 30 days'::text,
    '30 days'::text,
    COUNT(*)::bigint,
    'Operational email audit trail; keep recent rows for support.'::text
  FROM public.email_send_log
  WHERE created_at < now() - interval '30 days'
    AND status IN ('sent', 'failed', 'suppressed', 'bounced', 'complained', 'dlq')

  UNION ALL

  SELECT
    'activity_events'::text,
    'low-level activity gate events older than 90 days'::text,
    '90 days'::text,
    COUNT(*)::bigint,
    'Internal activity gating telemetry, not the user-facing activity feed.'::text
  FROM public.activity_events
  WHERE created_at < now() - interval '90 days'

  UNION ALL

  SELECT
    'entity_activity_log'::text,
    'non-surfaced info activity older than 90 days'::text,
    '90 days'::text,
    COUNT(*)::bigint,
    'Only rows hidden from the user feed and severity=info.'::text
  FROM public.entity_activity_log
  WHERE created_at < now() - interval '90 days'
    AND surface_to_user = false
    AND severity = 'info'

  UNION ALL

  SELECT
    'account_portability_jobs'::text,
    'expired or completed portability job rows older than 14 days'::text,
    '14 days'::text,
    COUNT(*)::bigint,
    'Clear storage objects via Storage API first when storage_path is present.'::text
  FROM public.account_portability_jobs
  WHERE status IN ('completed', 'failed', 'rolled_back')
    AND COALESCE(expires_at, created_at + interval '14 days') < now()

  UNION ALL

  SELECT
    'chat_imports'::text,
    'failed or cancelled import job metadata older than 30 days'::text,
    '30 days'::text,
    COUNT(*)::bigint,
    'Import metadata only; imported memory rows are in separate tables.'::text
  FROM public.chat_imports
  WHERE created_at < now() - interval '30 days'
    AND status IN ('failed', 'cancelled')
),

retention_candidates_ranked AS (
  SELECT
    row_number() OVER (ORDER BY rows DESC, table_name) AS row_num,
    table_name,
    candidate,
    retention_window,
    rows,
    note
  FROM retention_candidates_raw
),

retention_candidates AS (
  SELECT
    '09_retention_candidates_for_review'::text AS section,
    row_num,
    table_name AS item,
    candidate AS metric,
    rows::text AS value,
    concat('retention_window=', retention_window, ' | ', note)::text AS details
  FROM retention_candidates_ranked
),

interpretation AS (
  SELECT
    '10_interpretation'::text AS section,
    1::bigint AS row_num,
    'next_step'::text AS item,
    'guidance'::text AS metric,
    'Review sections 02, 03, 04, 06, and 09.'::text AS value,
    'Large inactive WAL points to replication/realtime first. High dead tuple pct points to vacuum maintenance. Large bucket logical size points to Storage API cleanup.'::text AS details
)

SELECT section, row_num, item, metric, value, details FROM database_size
UNION ALL
SELECT section, row_num, item, metric, value, details FROM replication_slots
UNION ALL
SELECT section, row_num, item, metric, value, details FROM top_relations
UNION ALL
SELECT section, row_num, item, metric, value, details FROM vacuum_health
UNION ALL
SELECT section, row_num, item, metric, value, details FROM growth_tables
UNION ALL
SELECT section, row_num, item, metric, value, details FROM storage_bucket_sizes
UNION ALL
SELECT section, row_num, item, metric, value, details FROM storage_table_sizes
UNION ALL
SELECT section, row_num, item, metric, value, details FROM pgmq_sizes
UNION ALL
SELECT section, row_num, item, metric, value, details FROM retention_candidates
UNION ALL
SELECT section, row_num, item, metric, value, details FROM interpretation
ORDER BY section, row_num, item;
