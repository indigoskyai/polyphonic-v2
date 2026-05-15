-- ============================================================================
-- Repair service-role RLS on messages, memories, beliefs
--
-- Beta-tester Tara hit `new row violates row-level security policy for table
-- "messages"` mid-chat (2026-05-10), and her substrate shows 160 engrams but
-- 0 memories and 0 beliefs. Engram inserts pass RLS, the higher-layer inserts
-- on memories and beliefs don't.
--
-- Three causes converged:
--
--   1. The 2026-05-08 sweep migration `20260508234319_a09bf804-...sql`
--      tightened service-role policies on 39 tables, including `messages`
--      and `memories`. Whether that sweep applied cleanly to every row in
--      every environment is uncertain — Tara's environment behaves as if
--      it didn't.
--
--   2. `beliefs` was NOT in the sweep's 39-table array. Its original policy
--      (from `20260311000000_*`) uses the old style:
--        CREATE POLICY "Service role full access beliefs"
--          ON public.beliefs FOR ALL
--          USING (current_setting('role') = 'service_role')
--      That form is not strictly wrong but is brittle — depending on how
--      Supabase resolves the role context it can return false for a
--      legitimate service-role client.
--
--   3. The `memories` table likely never had a service-role policy at all
--      before the 2026-05-08 sweep. The original 2026-02-13 schema only
--      created `auth.uid() = user_id` policies for end users; service-role
--      writes were implicit (assumed via JWT-bypass-on-service-role-key).
--      That assumption is fragile.
--
-- This migration is idempotent. It enumerates existing service-role-named
-- policies on each of the three tables, drops them, then recreates a single
-- canonical policy per table:
--
--   CREATE POLICY "Service role full access <table>"
--     ON public.<table> AS PERMISSIVE FOR ALL TO service_role
--     USING (true) WITH CHECK (true)
--
-- This is the same canonical form the 2026-05-08 sweep used; we are
-- guaranteeing it lands cleanly on all three target tables.
--
-- Safety: PERMISSIVE policies are OR-ed. The existing user-side
-- `auth.uid() = user_id` policies are unchanged and continue to gate
-- authenticated user inserts. The new policy is granted explicitly to
-- `service_role` and only takes effect when the connection runs under that
-- role (i.e., edge functions using the service-role key).
-- ============================================================================

DO $mig$
DECLARE
  t text;
  tables text[] := ARRAY['messages', 'memories', 'beliefs'];
  polname text;
  existing text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop any existing policy on this table whose name contains
    -- "service_role" or "Service role" (case-insensitive). Catches both
    -- the canonical "Service role full access <t>" and any older variants
    -- like "Service role can do everything" or "service_role bypass".
    FOR existing IN
      SELECT p.polname
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = t
         AND (p.polname ILIKE '%service_role%' OR p.polname ILIKE '%Service role%')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', existing, t);
    END LOOP;

    -- Create the canonical service-role policy.
    polname := 'Service role full access ' || t;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
      polname,
      t
    );
  END LOOP;
END
$mig$;

-- Verification query (run manually post-apply):
--
-- SELECT c.relname, p.polname, p.polpermissive,
--        array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)), ', ') AS roles,
--        pg_get_expr(p.polqual, p.polrelid) AS using_expr,
--        pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public'
--    AND c.relname IN ('messages', 'memories', 'beliefs')
--    AND p.polname ILIKE '%service%role%'
--  ORDER BY c.relname;
--
-- Expect exactly 3 rows: one per table, each with:
--   permissive  = t
--   roles       = service_role
--   using_expr  = true
--   with_check_expr = true
