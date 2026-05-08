-- ============================================================================
-- client_error_log — minimal Supabase-native error reporting
-- (PRODUCTION_LAUNCH_CHECKLIST.md Operations#error-reporting)
--
-- Purpose: receive captured errors from the running React app — uncaught
-- ErrorBoundary errors, window.onerror, and unhandledrejection events — so
-- staging produces a queryable trail without taking on a third-party APM
-- dependency.
--
-- Schema:
--   user_id     — null for unauthenticated routes (auth pages, callback)
--   level       — 'error' | 'warning' | 'info' (clients use 'error' by default)
--   source      — 'react'   from ErrorBoundary
--                 'window'   from window.onerror
--                 'promise'  from unhandledrejection
--                 'manual'   from explicit reportError calls
--   message     — err.message (truncated client-side to 1KB)
--   stack       — err.stack (truncated client-side to 8KB)
--   context     — JSONB: { route, build, userAgent, viewport, extras }
--   request_id  — optional client-generated id so duplicate captures dedupe
--
-- RLS:
--   INSERT — any role (authenticated, anon, service) can insert. Anon insert
--            is required so login/signup/reset-password errors land too.
--            user_id is set from auth.uid() when present, else null.
--   SELECT — service-role only. Operators query via Supabase dashboard or
--            edge functions; ordinary clients never read this table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_error_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  level       text        NOT NULL    DEFAULT 'error'
              CHECK (level IN ('error','warning','info')),
  source      text        NOT NULL
              CHECK (source IN ('react','window','promise','manual')),
  message     text        NOT NULL,
  stack       text,
  context     jsonb       NOT NULL    DEFAULT '{}'::jsonb,
  request_id  text
);

CREATE INDEX IF NOT EXISTS client_error_log_created_at_idx
  ON public.client_error_log (created_at DESC);

CREATE INDEX IF NOT EXISTS client_error_log_user_created_idx
  ON public.client_error_log (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_error_log_request_id_idx
  ON public.client_error_log (request_id)
  WHERE request_id IS NOT NULL;

-- Dedupe: if a request_id repeats within 5 minutes, drop the new row.
-- Implemented via a partial unique index on (request_id, created_at-bucket).
-- We use a simple unique index on request_id alone for now — if a client
-- retries a capture with the same id, the second insert is rejected and the
-- client treats that as success. Older identical request_ids from the same
-- error pattern are accepted (different rows, different timestamps).
CREATE UNIQUE INDEX IF NOT EXISTS client_error_log_request_id_unique
  ON public.client_error_log (request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

-- Anyone can insert. user_id is taken from auth.uid() when present.
DROP POLICY IF EXISTS "client_error_log_insert_any" ON public.client_error_log;
CREATE POLICY "client_error_log_insert_any"
  ON public.client_error_log
  FOR INSERT
  TO anon, authenticated, service_role
  WITH CHECK (
    -- If a user_id is supplied, it must match auth.uid() (if any).
    -- Anonymous inserts must omit user_id.
    user_id IS NULL OR user_id = auth.uid()
  );

-- Only service-role can read. No anon/authenticated SELECT policy.
-- (No policy = no rows returned for those roles.)
DROP POLICY IF EXISTS "client_error_log_select_service_role" ON public.client_error_log;
CREATE POLICY "client_error_log_select_service_role"
  ON public.client_error_log
  FOR SELECT
  TO service_role
  USING (true);

COMMENT ON TABLE public.client_error_log IS
  'Captured client-side errors from the React app. INSERT-any, SELECT-service-role. See src/lib/observability.ts.';
