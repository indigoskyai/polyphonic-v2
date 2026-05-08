-- ============================================================================
-- Owner-scope policy audit — Pass A.2 (companion to rls-coverage.sql)
--
-- Read-only. Surfaces RLS policies that may NOT be owner-scoped, so a human
-- can review whether each is correct (e.g. service-only tables, public-read
-- published surfaces, intentionally global tables) or a launch blocker.
--
-- A policy is suspected non-owner-scoped if its USING/WITH CHECK expression
-- does not reference auth.uid() or service-role checks. False positives are
-- expected — service-only and published-read tables show up here. The point
-- is to surface them for explicit review, not to fail automatically.
--
-- Pass criterion: every row that appears here is either
--   (a) intentionally service-only / published-read (acceptable, document why)
--   (b) a real launch blocker (fix the policy)
-- ============================================================================

\echo '── 1. policies that do NOT reference auth.uid() in USING or WITH CHECK ──'
SELECT
  c.relname                                                  AS table_name,
  p.polname                                                  AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END                                                        AS command,
  pg_get_expr(p.polqual,      p.polrelid)                    AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid)                    AS with_check_expr,
  array_to_string(
    ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)),
    ', '
  )                                                          AS roles
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') NOT LIKE '%auth.uid()%'
  AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') NOT LIKE '%auth.uid()%'
ORDER BY c.relname, p.polname;

\echo '── 2. policies granted to anon (must be public-read by design) ──────────'
SELECT
  c.relname  AS table_name,
  p.polname  AS policy_name,
  array_to_string(
    ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)),
    ', '
  )          AS roles,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END        AS command
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND 'anon' = ANY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles))
ORDER BY c.relname, p.polname;

\echo ''
\echo 'Review both result sets. Document any intentional exceptions in'
\echo 'PRODUCTION_AUDIT.md §14 (Accepted-risk register).'
