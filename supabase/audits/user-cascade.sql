-- ============================================================================
-- User cascade-on-delete audit — Pass A.4 (PRODUCTION_LAUNCH_CHECKLIST.md
-- Reliability #4: "Cascade-on-user-delete tested in a scratch account; zero
-- orphan rows")
--
-- Read-only. Surfaces public-schema tables with a foreign key into auth.users
-- whose ON DELETE action is NOT CASCADE. Those rows would orphan when a user
-- is deleted, leaving stale per-user state behind.
--
-- This is a static structural check. The launch checklist also requires a
-- live test in a scratch account: create a user, populate every surface,
-- DELETE FROM auth.users WHERE id = …, then re-run this script and verify
-- zero rows survive across user-scoped tables. (See user-cascade-live.sql
-- for the live verification template.)
--
-- Pass criterion: result set #1 returns zero rows, OR every row that
-- appears is intentionally non-cascading (document in §14 Accepted-risk).
-- ============================================================================

\echo '── 1. user FKs without ON DELETE CASCADE ────────────────────────────────'
SELECT
  con.conname                              AS constraint_name,
  cl.relname                               AS table_name,
  string_agg(att.attname, ', ' ORDER BY u.attposition) AS columns,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END                                      AS on_delete_action,
  ref.relname                              AS references_table
FROM pg_constraint con
JOIN pg_class      cl  ON cl.oid  = con.conrelid
JOIN pg_namespace  ns  ON ns.oid  = cl.relnamespace
JOIN pg_class      ref ON ref.oid = con.confrelid
JOIN pg_namespace  refns ON refns.oid = ref.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, attposition) ON TRUE
JOIN pg_attribute  att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
WHERE con.contype = 'f'
  AND ns.nspname    = 'public'
  AND refns.nspname = 'auth'
  AND ref.relname   = 'users'
  AND con.confdeltype <> 'c'    -- anything not CASCADE
GROUP BY con.conname, cl.relname, con.confdeltype, ref.relname
ORDER BY cl.relname;

\echo '── 2. summary ───────────────────────────────────────────────────────────'
SELECT
  COUNT(*) FILTER (WHERE con.confdeltype = 'c') AS cascading_user_fks,
  COUNT(*) FILTER (WHERE con.confdeltype <> 'c') AS non_cascading_user_fks,
  COUNT(*)                                       AS total_user_fks
FROM pg_constraint con
JOIN pg_class      cl  ON cl.oid  = con.conrelid
JOIN pg_namespace  ns  ON ns.oid  = cl.relnamespace
JOIN pg_class      ref ON ref.oid = con.confrelid
JOIN pg_namespace  refns ON refns.oid = ref.relnamespace
WHERE con.contype = 'f'
  AND ns.nspname    = 'public'
  AND refns.nspname = 'auth'
  AND ref.relname   = 'users';

\echo ''
\echo 'Pass criterion: result set #1 returns zero rows, or every row is'
\echo 'intentionally non-cascading and documented in §14 Accepted-risk.'
