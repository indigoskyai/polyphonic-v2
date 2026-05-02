-- Phase 2 continuation: lock down SECURITY DEFINER function execution.
-- Revoke from anon (and authenticated where the function is trigger-only or cron-only).
-- Keep authenticated EXECUTE only on functions intentionally invoked by the client.

-- Trigger-only (called by Postgres trigger context as table owner; no direct caller needed)
REVOKE EXECUTE ON FUNCTION public.auto_assign_first_admin()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_agents()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_memory_settings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_settings()       FROM PUBLIC, anon, authenticated;

-- Cron / service-role only
REVOKE EXECUTE ON FUNCTION public.auto_commit_stale_memory_candidates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_app_config(text)                  FROM PUBLIC, anon, authenticated;

-- User-callable but never anon (each uses auth.uid() internally)
REVOKE EXECUTE ON FUNCTION public.save_user_api_key(text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_user_api_key()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_activity_seen()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_engrams(text, integer, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_memories(text, integer, uuid) FROM PUBLIC, anon;

-- has_role: invoked from RLS policies executed under authenticated context. Keep authenticated, revoke anon.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;