-- Mnemos Tier 2/3 · Phase 0 — Loud-failure invoke_edge_function.
--
-- The shared cron invoker used to handle missing config (app_config.supabase_url
-- / service_role_key absent) with a silent RAISE NOTICE + RETURN NULL. That is a
-- root enabler of the 6-week silent freeze: if config ever drops, EVERY cron
-- becomes a no-op while dashboards stay green.
--
-- This is CREATE OR REPLACE preserving the happy path byte-for-byte; the ONLY
-- change is the missing-config branch: RAISE WARNING (visible in logs/alerting,
-- unlike NOTICE) + a best-effort cron_health failure record (queryable by the
-- watchdog), then still RETURN NULL. The record call is exception-wrapped so it
-- can never break the (already-degraded) invoke path. Grants are untouched
-- (CREATE OR REPLACE preserves them).
--
-- PRECONDITION (verified): app_config currently HAS both keys, so this branch is
-- not reached in normal operation — this is a safety net for future config loss,
-- not a behavior change to the live path.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(function_name text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.app_config WHERE key = 'service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: missing app_config (supabase_url/service_role_key) — % NOT invoked', function_name;
    BEGIN
      PERFORM public.record_cron_run(
        p_job_name    := function_name,
        p_success     := false,
        p_duration_ms := 0,
        p_error       := 'invoke_edge_function: missing app_config (supabase_url/service_role_key)'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- never let health-recording break the invoke path
    END;
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url     := v_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := payload
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;
