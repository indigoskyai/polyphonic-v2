-- ============================================================================
-- RLS coverage audit — Pass A.2 (PRODUCTION_LAUNCH_CHECKLIST.md security #3)
--
-- Read-only. Returns three result sets:
--   1. public-schema tables WITHOUT row level security enabled
--   2. public-schema tables WITH RLS enabled but ZERO policies
--   3. summary counts
--
-- Run from psql connected to staging or production:
--   psql "$DATABASE_URL" -f supabase/audits/rls-coverage.sql
-- Or paste into the Supabase SQL editor.
--
-- Pass criterion (launch checklist Security #3):
--   RLS verified on every public-schema table; all owner-scoped.
--   This script proves "every public-schema table has RLS + at least one policy".
--   The owner-scope check still requires reading the policy bodies — see
--   policy-owner-scope.sql for that pass.
-- ============================================================================

\echo '── 1. public tables without RLS enabled ─────────────────────────────────'
SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'RLS ON' ELSE 'RLS OFF' END AS rls_status,
  CASE WHEN c.relforcerowsecurity THEN 'forced' ELSE 'normal' END AS force_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'                      -- ordinary tables only
  AND NOT c.relrowsecurity                  -- RLS NOT enabled
ORDER BY c.relname;

\echo '── 2. public tables with RLS on but zero policies ────────────────────────'
SELECT
  c.relname AS table_name,
  COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
GROUP BY c.relname, c.oid
HAVING COUNT(p.polname) = 0
ORDER BY c.relname;

\echo '── 3. summary ────────────────────────────────────────────────────────────'
SELECT
  COUNT(*) FILTER (WHERE c.relrowsecurity)                                  AS tables_with_rls,
  COUNT(*) FILTER (WHERE NOT c.relrowsecurity)                              AS tables_without_rls,
  COUNT(*)                                                                  AS total_public_tables,
  (SELECT COUNT(*) FROM pg_policy p
     JOIN pg_class c2 ON c2.oid = p.polrelid
     JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
     WHERE n2.nspname = 'public')                                            AS total_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r';

\echo ''
\echo 'Pass criterion: result set #1 and #2 should both return zero rows.'
\echo 'Then run policy-owner-scope.sql for the per-policy owner-scope check.'
