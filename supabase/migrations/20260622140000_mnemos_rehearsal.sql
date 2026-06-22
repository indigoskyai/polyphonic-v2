-- Mnemos Tier 2/3 · Phase 1b — Autonomous rehearsal pass (the re-reader).
--
-- ROOT CAUSE this attacks: the autonomous loop only WRITES. reconsolidate()
-- (the sole path that bumps accessibility/stability) fires only on human-turn
-- retrieval, so 91.5% of engrams are never re-read and 77.9% sit at the
-- stability floor. This adds a scheduled, spaced-repetition pass that READS the
-- substrate: it re-accesses high-value but under-rehearsed engrams and applies
-- the reconsolidation reinforcement (stability += 0.05*(1-stability);
-- accessibility += 0.1; last_accessed_at = now; dormant -> active). Refreshed
-- last_accessed_at also re-enters them into the consolidation/belief candidate
-- window so rehearsal feeds belief formation.
--
-- DELIBERATE DIVERGENCE from reconsolidate() (per adversarial audit): rehearsal
-- bumps a SEPARATE `rehearse_count`, NOT `access_count`. Promotion to semantic
-- (consolidation.promoteEngrams) gates on access_count>=3, and bumping
-- access_count here would let the machine auto-promote episodic memories —
-- including crisis/therapeutic ones — to "general knowledge" with zero human
-- access. Keeping a separate counter preserves the durability benefit
-- (accessibility/stability lift) while leaving promotion human-gated. Spacing
-- is therefore keyed on rehearse_count. (To later let rehearsal count toward
-- promotion, switch the counter — that's an intentional product decision.)
--
-- Pure-SQL (like the watchdog): no edge fn / invoke dependency, one indexed pass
-- per scope. COHORT-GATED to the 8 power users for dark-launch. Pairs with the
-- decay-survival change (stability lifted here only protects survival once
-- determineState reads it — both ship together). Tunable v1 dials: value floor
-- 0.25, budget 150/scope/night, spacing 24h*2^min(rehearse_count,6).

-- separate rehearsal counter (additive, metadata-only default — does NOT feed promotion)
ALTER TABLE public.engrams ADD COLUMN IF NOT EXISTS rehearse_count integer NOT NULL DEFAULT 0;

-- selection index (scope + recency, only live states)
CREATE INDEX IF NOT EXISTS idx_engrams_rehearsal
  ON public.engrams (user_id, agent_id, last_accessed_at)
  WHERE state IN ('active','dormant','consolidating');

-- ── per-scope rehearsal: select high-value/under-rehearsed, apply reconsolidate deltas ──
CREATE OR REPLACE FUNCTION public.mnemos_rehearse_scope(
  p_user_id uuid,
  p_agent_id text,
  p_budget integer DEFAULT 150,
  p_value_floor numeric DEFAULT 0.25
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now   timestamptz := now();
  v_count integer := 0;
BEGIN
  WITH degree AS (
    SELECT eid, count(*)::numeric AS c FROM (
      SELECT source_id AS eid FROM connections WHERE user_id = p_user_id AND agent_id = p_agent_id
      UNION ALL
      SELECT target_id AS eid FROM connections WHERE user_id = p_user_id AND agent_id = p_agent_id
    ) u GROUP BY eid
  ),
  candidates AS (
    SELECT e.id, e.rehearse_count, e.last_accessed_at,
      ( 0.45 * COALESCE(e.strength, 0)
      + 0.25 * LEAST(1.0, COALESCE(d.c, 0) / 5.0)
      + 0.20 * COALESCE(e.surprise_score, 0)
      + 0.10 * ABS(COALESCE(e.emotional_arousal, 0)) ) AS base_value,
      EXISTS (
        SELECT 1 FROM beliefs b
        WHERE b.user_id = p_user_id
          AND b.agent_id = p_agent_id
          AND (e.id = ANY(b.supporting_engram_ids) OR e.id = ANY(b.contradicting_engram_ids))
      ) AS belief_linked
    FROM engrams e
    LEFT JOIN degree d ON d.eid = e.id
    WHERE e.user_id = p_user_id
      AND e.agent_id = p_agent_id
      AND e.state IN ('active','dormant','consolidating')
      AND e.created_at <= v_now - interval '72 hours'
  ),
  eligible AS (
    SELECT id, GREATEST(base_value, CASE WHEN belief_linked THEN 0.7 ELSE 0 END) AS value
    FROM candidates
    WHERE last_accessed_at IS NULL
       OR last_accessed_at < v_now - (interval '24 hours' * power(2, LEAST(COALESCE(rehearse_count, 0), 6)))
  ),
  picked AS (
    SELECT id FROM eligible WHERE value >= p_value_floor ORDER BY value DESC LIMIT p_budget
  ),
  upd AS (
    UPDATE engrams e SET
      stability        = LEAST(1.0, round((COALESCE(e.stability, 0) + 0.05 * (1 - COALESCE(e.stability, 0)))::numeric, 4)),
      accessibility    = LEAST(1.0, round((COALESCE(e.accessibility, 0) + 0.1)::numeric, 4)),
      rehearse_count   = COALESCE(e.rehearse_count, 0) + 1,
      last_accessed_at = v_now,
      state            = CASE WHEN e.state = 'dormant' THEN 'active' ELSE e.state END
    FROM picked p WHERE e.id = p.id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

-- ── cohort driver: rehearse each (user, agent) scope for the 8 power users ──
CREATE OR REPLACE FUNCTION public.mnemos_run_rehearsal_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort uuid[] := ARRAY[
    'cd557ff7-57ab-48c6-b5a3-a9432d1159ab', -- mistski
    '47299895-1796-4dbd-95a1-9b6f2fbe97eb', -- karen
    '2c1fd658-4a4f-4ee6-b2eb-88ba4a8019be', -- mich.killen
    '33d6d9f8-be8b-48f7-8899-33cc60939f82', -- Riley
    'a085f84f-8457-4274-bee4-f3f6b9c3d865', -- twsherrard83
    '26063e00-d5f1-48ef-a775-81979de987ac', -- gaiaskyarcanum
    '4413f702-d6b3-4680-bd51-42d9049785a3', -- aureliavespera694
    '2f5cf107-fc39-4283-99e0-5a3b2e60071e'  -- halliebkup
  ]::uuid[];
  r        record;
  v_n      integer;
  v_total  integer := 0;
  v_scopes integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, agent_id FROM engrams
    WHERE user_id = ANY(v_cohort) AND state IN ('active','dormant','consolidating')
  LOOP
    v_n := public.mnemos_rehearse_scope(r.user_id, r.agent_id, 150, 0.25);
    v_total := v_total + v_n;
    v_scopes := v_scopes + 1;
  END LOOP;
  RETURN jsonb_build_object('ran_at', now(), 'scopes', v_scopes, 'rehearsed', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mnemos_rehearse_scope(uuid, text, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_run_rehearsal_cohort() TO service_role;

-- schedule nightly at 04:40 (after graduate 04:15; in-DB, not via invoke_edge_function)
SELECT cron.unschedule('mnemos-rehearse')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-rehearse');
SELECT cron.schedule('mnemos-rehearse', '40 4 * * *',
  $$SELECT public.mnemos_run_rehearsal_cohort()$$);
