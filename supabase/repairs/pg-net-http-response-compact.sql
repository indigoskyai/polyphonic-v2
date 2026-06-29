-- ============================================================================
-- One-time repair: compact pg_net response history
--
-- Supabase pg_net stores recent async HTTP responses in net._http_response.
-- The extension normally keeps only a short recent window, but the table can
-- remain physically large after old response rows are cleared.
--
-- Run the preview first. If row/content counts are small but table_size is
-- large, run the compact command by itself in Supabase SQL Editor.
-- ============================================================================

SELECT
  pg_size_pretty(pg_total_relation_size('net._http_response'::regclass)) AS table_size,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE created < now() - interval '6 hours') AS older_than_6h,
  MIN(created) AS oldest_response,
  MAX(created) AS newest_response,
  pg_size_pretty(COALESCE(SUM(pg_column_size(content)), 0)) AS response_content_size,
  pg_size_pretty(COALESCE(SUM(pg_column_size(headers)), 0)) AS response_headers_size
FROM net._http_response;

-- Run this by itself, as a separate SQL Editor run:
--
--   VACUUM (FULL, ANALYZE) net._http_response;
