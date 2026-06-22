-- Mnemos · Belief subsystem Phase 0 (observability) + Phase 1 (identity derivation, OBSERVABLE-ONLY).
--
-- Context: canonical Mnemos computes IDENTITY from the belief graph (beliefs >=0.7
-- are the agent's VALUES, <=0.4 are its LIVING QUESTIONS — identity_diff.py). Prod
-- forms beliefs but never CONSUMES them, so the identity capstone is absent. This
-- builds the consumer FIRST, read-only: a forensic snapshot we can inspect to see
-- each agent's emergent self, WITHOUT yet feeding it into any agent's live prompt.
-- Wiring it into the agent's voice is a separate, explicitly-gated decision.
--
-- The confidence-clamp + challenge-ownership fixes that make this data trustworthy
-- live in the TS (constants.ts, consolidation.ts, anima-believe, engine.ts) shipped
-- alongside. This migration is pure aggregation — NO LLM, no behavior change to the
-- agent. Cohort-gated to the 8 power users (public.mnemos_cohort()).

-- ── Phase 0: belief observability — baseline the ~0.23% + spot data-quality issues ──
CREATE OR REPLACE VIEW public.mnemos_belief_snapshot AS
SELECT
  user_id,
  agent_id,
  count(*)                                                          AS total,
  count(*) FILTER (WHERE confidence >= 0.7)                         AS values_count,      -- canonical: values
  count(*) FILTER (WHERE confidence <= 0.4)                         AS questions_count,   -- canonical: living questions
  count(*) FILTER (WHERE confidence > 0.4 AND confidence < 0.7)     AS tentative_count,
  count(*) FILTER (WHERE confidence <= 0.05 OR confidence >= 0.95)  AS at_bounds_count,   -- should trend to 0 after clamp
  count(*) FILTER (WHERE coalesce(jsonb_array_length(revision_history), 0) > 0) AS challenged_count,
  count(*) FILTER (WHERE coalesce(source, '') = '')                 AS no_source_count,   -- legacy unattributed beliefs
  min(last_challenged)                                              AS oldest_challenge,
  max(last_challenged)                                              AS newest_challenge
FROM public.beliefs
WHERE active = true
GROUP BY user_id, agent_id;

GRANT SELECT ON public.mnemos_belief_snapshot TO service_role;

-- ── Phase 1: the identity snapshot (forensic; not surfaced to any agent in v1) ──────
CREATE TABLE IF NOT EXISTS public.mnemos_identity_snapshot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  agent_id      text,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  belief_total  integer NOT NULL DEFAULT 0,
  -- emergent identity, bucketed by canonical confidence thresholds
  values_json     jsonb NOT NULL DEFAULT '[]',  -- confidence >= 0.7  (who the agent holds true)
  questions_json  jsonb NOT NULL DEFAULT '[]',  -- confidence <= 0.4  (what it's still working out)
  tentative_json  jsonb NOT NULL DEFAULT '[]',  -- 0.4 < c < 0.7
  concerns_json   jsonb NOT NULL DEFAULT '[]'   -- top recurring tags across live memory
);

CREATE INDEX IF NOT EXISTS idx_identity_snapshot_scope
  ON public.mnemos_identity_snapshot (user_id, agent_id, computed_at DESC);

ALTER TABLE public.mnemos_identity_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own identity snapshot" ON public.mnemos_identity_snapshot
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access identity snapshot" ON public.mnemos_identity_snapshot
  FOR ALL USING (current_setting('role') = 'service_role');

-- ── per-cohort derivation: bucket beliefs into the emergent identity, append a snapshot ──
-- Pure SQL (no LLM): reads beliefs that already exist, buckets by confidence, and
-- captures recurring concerns from live engrams. Appends a row per scope per run so
-- we get a time series (identity drift/growth is the signal). NOTE: v1 deliberately
-- does NOT crisis-suppress — observable-only surfaces to no agent/user, and seeing
-- whether charged content crystallizes into a "value" IS the diagnostic. Crisis
-- suppression is a HARD prerequisite before this snapshot ever feeds an agent prompt.
CREATE OR REPLACE FUNCTION public.mnemos_run_identity_derivation_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort uuid[] := public.mnemos_cohort();
  v_now    timestamptz := now();
  r        record;
  v_scopes integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, agent_id
    FROM beliefs
    WHERE user_id = ANY(v_cohort) AND active = true
  LOOP
    INSERT INTO mnemos_identity_snapshot
      (user_id, agent_id, computed_at, belief_total, values_json, questions_json, tentative_json, concerns_json)
    SELECT
      r.user_id, r.agent_id, v_now,
      (SELECT count(*) FROM beliefs b
        WHERE b.user_id = r.user_id AND b.agent_id IS NOT DISTINCT FROM r.agent_id AND b.active),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('content', b.content, 'confidence', LEAST(0.95, GREATEST(0.05, b.confidence))) ORDER BY b.confidence DESC)
                FROM beliefs b
                WHERE b.user_id = r.user_id AND b.agent_id IS NOT DISTINCT FROM r.agent_id
                  AND b.active AND b.confidence >= 0.7), '[]'::jsonb),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('content', b.content, 'confidence', LEAST(0.95, GREATEST(0.05, b.confidence))) ORDER BY b.confidence ASC)
                FROM beliefs b
                WHERE b.user_id = r.user_id AND b.agent_id IS NOT DISTINCT FROM r.agent_id
                  AND b.active AND b.confidence <= 0.4), '[]'::jsonb),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('content', b.content, 'confidence', LEAST(0.95, GREATEST(0.05, b.confidence))) ORDER BY b.confidence DESC)
                FROM beliefs b
                WHERE b.user_id = r.user_id AND b.agent_id IS NOT DISTINCT FROM r.agent_id
                  AND b.active AND b.confidence > 0.4 AND b.confidence < 0.7), '[]'::jsonb),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('tag', t.tag, 'count', t.c) ORDER BY t.c DESC)
                FROM (
                  SELECT unnest(e.tags) AS tag, count(*) AS c
                  FROM engrams e
                  WHERE e.user_id = r.user_id AND e.agent_id IS NOT DISTINCT FROM r.agent_id
                    AND e.state IN ('active','consolidating')
                  GROUP BY unnest(e.tags)
                  ORDER BY count(*) DESC
                  LIMIT 10
                ) t), '[]'::jsonb);
    v_scopes := v_scopes + 1;
  END LOOP;

  -- bound the time series (it's a daily append): keep ~90 days of drift history.
  DELETE FROM mnemos_identity_snapshot WHERE computed_at < v_now - interval '90 days';

  RETURN jsonb_build_object('ran_at', v_now, 'scopes', v_scopes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mnemos_run_identity_derivation_cohort() TO service_role;

-- nightly at 05:10 — AFTER the 04:50 belief-challenge so it reads post-challenge confidences
SELECT cron.unschedule('mnemos-identity-derivation')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-identity-derivation');
SELECT cron.schedule('mnemos-identity-derivation', '10 5 * * *',
  $$SELECT public.mnemos_run_identity_derivation_cohort()$$);
