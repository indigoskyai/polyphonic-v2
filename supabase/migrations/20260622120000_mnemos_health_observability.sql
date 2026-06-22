-- Mnemos Tier 2/3 · Phase 0 — Observability seatbelt (pure-SQL watchdog).
--
-- Five maturation queues silently sat at 0% advancement for ~6 weeks because
-- cron_health only records "did the SQL run", never "did a row advance". This
-- adds an in-database watchdog that snapshots each queue's cumulative state and
-- flags a STALL when an advancement metric fails to move over ~24h while a
-- backlog still exists.
--
-- Deliberately pure-SQL (no edge function): it must not depend on the same
-- invoke_edge_function path it is meant to watch, and it requires NO changes to
-- any existing function or behavior — it measures advancement directly from the
-- data tables. Additive only: one table, one function, one cron job.
--
-- Thresholds are intentionally minimal for v1 ("did it advance at all"); tighten
-- to real KPI targets only after the depth fixes (Phases 1-3) land, else it will
-- correctly-but-annoyingly flag still-frozen queues every run.

-- ── snapshot store ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mnemos_health_metric (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  metric      text NOT NULL,
  value       numeric NOT NULL,        -- cumulative count / sum at snapshot time
  delta       numeric,                 -- change vs the latest snapshot >= 20h old (NULL until one exists)
  stalled     boolean NOT NULL DEFAULT false,
  detail      jsonb
);

CREATE INDEX IF NOT EXISTS idx_mnemos_health_metric_metric_time
  ON public.mnemos_health_metric (metric, snapshot_at DESC);

ALTER TABLE public.mnemos_health_metric ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mnemos_health_metric_service_all" ON public.mnemos_health_metric;
CREATE POLICY "mnemos_health_metric_service_all"
  ON public.mnemos_health_metric FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── watchdog ────────────────────────────────────────────────────────────────
-- Computes one row per metric. Advancement metrics (graduation, curiosity,
-- belief-challenge, digest review) also get delta vs the snapshot ~24h ago and a
-- STALL flag = (delta <= 0) AND (a backlog still exists). Returns + RAISE WARNING
-- on any stall so it surfaces in Postgres logs.
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

-- ── schedule (every 6h; in-DB call, does NOT route through invoke_edge_function) ──
SELECT cron.unschedule('mnemos-health-assert')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-health-assert');
SELECT cron.schedule('mnemos-health-assert', '0 */6 * * *',
  $$SELECT public.mnemos_run_health_snapshot()$$);
