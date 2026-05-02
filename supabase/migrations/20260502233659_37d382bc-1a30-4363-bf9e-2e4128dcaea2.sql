
-- cron_health: one row per job
CREATE TABLE public.cron_health (
  job_name text PRIMARY KEY,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_duration_ms int,
  run_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read cron health"
  ON public.cron_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- daily_usage: per user per scope per day
CREATE TABLE public.daily_usage (
  user_id uuid NOT NULL,
  scope text NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, day)
);
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own usage"
  ON public.daily_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- idempotency_keys: 24h dedupe window
CREATE TABLE public.idempotency_keys (
  key text PRIMARY KEY,
  user_id uuid NOT NULL,
  scope text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
-- service-role only, no policies for end users

CREATE INDEX idx_idempotency_keys_user_scope ON public.idempotency_keys(user_id, scope, created_at DESC);
CREATE INDEX idx_daily_usage_day ON public.daily_usage(day);

-- Cleanup function for idempotency keys older than 24h
CREATE OR REPLACE FUNCTION public.cleanup_idempotency_keys()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.idempotency_keys
   WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_idempotency_keys() FROM PUBLIC, anon, authenticated;

-- Cleanup function for daily_usage older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_daily_usage()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.daily_usage
   WHERE day < (now() AT TIME ZONE 'UTC')::date - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_daily_usage() FROM PUBLIC, anon, authenticated;

-- Daily usage atomic increment helper
CREATE OR REPLACE FUNCTION public.increment_daily_usage(p_user_id uuid, p_scope text, p_limit int)
RETURNS TABLE(allowed boolean, current_count int, day_limit int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_count int;
BEGIN
  INSERT INTO public.daily_usage (user_id, scope, day, count, updated_at)
  VALUES (p_user_id, p_scope, v_day, 1, now())
  ON CONFLICT (user_id, scope, day) DO UPDATE
    SET count = public.daily_usage.count + 1,
        updated_at = now()
  RETURNING count INTO v_count;

  IF v_count > p_limit THEN
    -- roll back the increment
    UPDATE public.daily_usage
       SET count = count - 1
     WHERE user_id = p_user_id AND scope = p_scope AND day = v_day;
    RETURN QUERY SELECT false, v_count - 1, p_limit;
  ELSE
    RETURN QUERY SELECT true, v_count, p_limit;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.increment_daily_usage(uuid, text, int) FROM PUBLIC, anon, authenticated;

-- Cron-health upsert helper (service role only)
CREATE OR REPLACE FUNCTION public.record_cron_run(
  p_job_name text,
  p_success boolean,
  p_duration_ms int,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cron_health (job_name, last_run_at, last_success_at, last_error, last_duration_ms, run_count, error_count, updated_at)
  VALUES (
    p_job_name, now(),
    CASE WHEN p_success THEN now() ELSE NULL END,
    CASE WHEN p_success THEN NULL ELSE p_error END,
    p_duration_ms, 1, CASE WHEN p_success THEN 0 ELSE 1 END, now()
  )
  ON CONFLICT (job_name) DO UPDATE SET
    last_run_at = now(),
    last_success_at = CASE WHEN p_success THEN now() ELSE public.cron_health.last_success_at END,
    last_error = CASE WHEN p_success THEN NULL ELSE p_error END,
    last_duration_ms = p_duration_ms,
    run_count = public.cron_health.run_count + 1,
    error_count = public.cron_health.error_count + CASE WHEN p_success THEN 0 ELSE 1 END,
    updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_cron_run(text, boolean, int, text) FROM PUBLIC, anon, authenticated;
