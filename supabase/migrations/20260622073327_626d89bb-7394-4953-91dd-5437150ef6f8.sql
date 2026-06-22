-- ── snapshot store ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mnemos_health_metric (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  metric      text NOT NULL,
  value       numeric NOT NULL,
  delta       numeric,
  stalled     boolean NOT NULL DEFAULT false,
  detail      jsonb
);

GRANT ALL ON public.mnemos_health_metric TO service_role;

CREATE INDEX IF NOT EXISTS idx_mnemos_health_metric_metric_time
  ON public.mnemos_health_metric (metric, snapshot_at DESC);

ALTER TABLE public.mnemos_health_metric ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mnemos_health_metric_service_all" ON public.mnemos_health_metric;
CREATE POLICY "mnemos_health_metric_service_all"
  ON public.mnemos_health_metric FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.mnemos_run_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_now    timestamptz := now();
  v_stalls jsonb;
BEGIN
  WITH cur(metric, value, adv, backlog) AS (
    SELECT 'engrams_total',           (SELECT count(*) FROM engrams)::numeric, false, NULL::numeric
    UNION ALL SELECT 'engrams_never_accessed',  (SELECT count(*) FROM engrams WHERE coalesce(access_count,0)=0)::numeric, false, NULL
    UNION ALL SELECT 'engrams_stability_floor', (SELECT count(*) FROM engrams WHERE coalesce(stability,0)<=0.11)::numeric, false, NULL
    UNION ALL SELECT 'engrams_dormant',         (SELECT count(*) FROM engrams WHERE state='dormant')::numeric, false, NULL
    UNION ALL SELECT 'hypomnema_graduated',     (SELECT count(*) FROM hypomnema_entry WHERE graduated_to_engram_id IS NOT NULL)::numeric, true,
                                                (SELECT count(*) FROM hypomnema_entry WHERE active AND graduated_to_engram_id IS NULL AND created_at <= v_now - interval '7 days')::numeric
    UNION ALL SELECT 'curiosity_resolved',      (SELECT count(*) FROM curiosity_questions WHERE status <> 'pending')::numeric, true,
                                                (SELECT count(*) FROM curiosity_questions WHERE status = 'pending')::numeric
    UNION ALL SELECT 'beliefs_challenged',      (SELECT count(*) FROM beliefs WHERE (CASE WHEN jsonb_typeof(revision_history) = 'array' THEN jsonb_array_length(revision_history) ELSE 0 END)>0)::numeric, true,
                                                (SELECT count(*) FROM beliefs WHERE coalesce(active,true) AND (CASE WHEN jsonb_typeof(revision_history) = 'array' THEN jsonb_array_length(revision_history) ELSE 0 END)=0)::numeric
    UNION ALL SELECT 'digest_reviewed_total',   (SELECT coalesce(sum(reviewed_count),0) FROM mnemos_digests)::numeric, true,
                                                (SELECT count(*) FROM mnemos_digests WHERE status = 'open')::numeric
    UNION ALL SELECT 'crisis_followups_done',   (SELECT count(*) FROM crisis_events WHERE followup_completed_at IS NOT NULL)::numeric, false, NULL
    UNION ALL SELECT 'emotional_history_total', (SELECT count(*) FROM emotional_history)::numeric, false, NULL
  ),
  prior AS (
    SELECT DISTINCT ON (metric) metric, value AS prior_value
    FROM mnemos_health_metric
    WHERE snapshot_at <= v_now - interval '20 hours'
    ORDER BY metric, snapshot_at DESC
  ),
  ins AS (
    INSERT INTO mnemos_health_metric (snapshot_at, metric, value, delta, stalled, detail)
    SELECT v_now, c.metric, c.value,
           CASE WHEN c.adv AND p.prior_value IS NOT NULL THEN c.value - p.prior_value END,
           CASE WHEN c.adv AND p.prior_value IS NOT NULL
                     AND (c.value - p.prior_value) <= 0
                     AND coalesce(c.backlog,0) > 0
                THEN true ELSE false END,
           jsonb_build_object('backlog', c.backlog, 'is_advancement', c.adv)
    FROM cur c LEFT JOIN prior p ON p.metric = c.metric
    RETURNING metric, value, delta, stalled
  )
  SELECT coalesce(
           jsonb_agg(jsonb_build_object('metric', metric, 'value', value, 'delta', delta))
             FILTER (WHERE stalled),
           '[]'::jsonb)
  INTO v_stalls
  FROM ins;

  IF jsonb_array_length(v_stalls) > 0 THEN
    RAISE WARNING 'mnemos_health: STALLED queues (no advancement in ~24h with backlog): %', v_stalls;
  END IF;

  RETURN jsonb_build_object('snapshot_at', v_now, 'stalled', v_stalls);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.mnemos_run_health_snapshot() TO service_role;

SELECT cron.unschedule('mnemos-health-assert')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-health-assert');
SELECT cron.schedule('mnemos-health-assert', '0 */6 * * *',
  $$SELECT public.mnemos_run_health_snapshot()$$);

-- ───────────────────────────────────────────────────────────────────────────
-- Loud-failure invoke_edge_function
-- ───────────────────────────────────────────────────────────────────────────
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
      NULL;
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