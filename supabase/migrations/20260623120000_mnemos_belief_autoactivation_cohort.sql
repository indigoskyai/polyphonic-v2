-- Mnemos Phase 4 — auto-activation of synthesized beliefs + widen cohort to all
-- keyed users + a dry-run-first cleanup of legacy belief pollution.
--
-- WHY. The dark-launch synthesized beliefs INACTIVE (active:false) until a human ran
-- an UPDATE — which doesn't scale past a handful of reviewed agents. This opens it to
-- the whole keyed population and lets guard-passing synthesized beliefs reach the
-- agent's prompt automatically. The TS side (consolidation.ts) owns the guard stack
-- (decideAutoActivation: env kill-switch + concern net + confidence floor) and a
-- per-run reconciliation sweep. This migration adds the data model + cohort + cleanup.
--
-- THREE parts:
--   1. beliefs.auto_activation jsonb — provenance marker. The activation sweep owns
--      rows where it is NOT NULL; a NULL marker = manually managed (e.g. luca's
--      hand-activated beliefs) and is never overridden by the machine.
--   2. mnemos_cohort() → ALL keyed users. Was a hardcoded 8-UUID dark-launch ring;
--      now "everyone who has a BYOK OpenRouter key" (synthesis can't run without one,
--      so keyed = eligible). This widens the whole maturation suite (rehearsal,
--      graduation, belief-challenge, digest-autoreview, identity-derivation,
--      synthesis) to keyed users together — coherent: they should mature as one.
--      Auto-activation itself stays behind its OWN env flag (BELIEF_SYNTHESIS_
--      AUTOACTIVATE), so widening the cohort does NOT by itself activate any belief.
--   3. mnemos_cleanup_legacy_beliefs — DRY-RUN by default. Synthesized beliefs
--      (0.5-0.78) are out-ranked by legacy 0.95 pasted-transcript/profile "beliefs"
--      in the kernel's top-8-by-confidence loader, so auto-activation is cosmetic
--      until the pollution is retired. One predicate (preview == commit), reversible.

-- ── 1. provenance marker ───────────────────────────────────────────────────────
ALTER TABLE public.beliefs ADD COLUMN IF NOT EXISTS auto_activation jsonb;

-- partial index for the per-scope reconciliation sweep (auto-managed synth beliefs).
CREATE INDEX IF NOT EXISTS idx_beliefs_synth_automanaged
  ON public.beliefs(user_id, agent_id)
  WHERE source = 'llm_synthesis' AND auto_activation IS NOT NULL;

-- ── 2. cohort → all keyed users ────────────────────────────────────────────────
-- Was IMMUTABLE (hardcoded array); now STABLE (reads user_api_keys). One row per
-- user (user_id UNIQUE), so no dedup needed. COALESCE keeps the empty-table case a
-- valid empty array. Volatility relaxation is safe: no index / generated column /
-- IMMUTABLE caller depends on this — only plpgsql crons and the JS synthesis gate.
CREATE OR REPLACE FUNCTION public.mnemos_cohort()
RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[])
  FROM public.user_api_keys
$$;

-- ── 3a. the single pollution predicate (preview == commit) ─────────────────────
-- TRUE iff a belief is legacy pollution safe to retire: NEVER a synthesized belief;
-- and either source-blank/extraction (the old verbatim copy-paths), a lexical
-- consolidation paste ('[tag] <pasted memory>'), or transcript/profile-shaped dumps.
-- Genuinely abstracted beliefs (source='consolidation' without the '[tag] ' prefix,
-- dialectic convictions, challenge-formed) are KEPT.
CREATE OR REPLACE FUNCTION public.mnemos_belief_is_legacy_pollution(
  p_source text, p_content text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_source, '') <> 'llm_synthesis'
     AND (
          COALESCE(p_source, '') IN ('', 'extraction')
       OR (p_source = 'consolidation' AND p_content LIKE '[%] %')
       OR p_content ILIKE '[conversation]%'
       OR p_content ILIKE '[profile]%'
       OR p_content ILIKE '[big-five]%'
       OR p_content ILIKE '[big\_five]%'
       OR p_content ILIKE '%IDENTITY PORTRAIT%'
       OR p_content ILIKE '%PERSONALITY DIMENSIONS%'
     );
$$;

-- ── 3b. review queue: synthesized beliefs the guard stack HELD for a human ──────
-- (concern net — corrosive identity content). There is no confidence floor: a
-- low-confidence belief is a "living question" and activates so the challenge loop
-- can evolve it; only concern-flagged beliefs are withheld. Admin-facing.
CREATE OR REPLACE VIEW public.mnemos_belief_review_queue AS
  SELECT b.id, b.user_id, b.agent_id, b.content,
         round(b.confidence::numeric, 2)        AS confidence,
         b.auto_activation->>'reason'           AS held_reason,
         b.auto_activation->>'at'               AS held_at,
         b.created_at
  FROM public.beliefs b
  WHERE b.source = 'llm_synthesis'
    AND b.active = false
    AND b.auto_activation->>'decision' = 'held'
    AND b.auto_activation->>'reason' = 'concern'
  ORDER BY b.created_at DESC;

-- ── 3c. the cleanup: dry-run by default, commit only when proven ───────────────
CREATE OR REPLACE FUNCTION public.mnemos_cleanup_legacy_beliefs(
  p_commit      boolean DEFAULT false,  -- false = dry-run (zero writes); true = retire one batch
  p_cohort_only boolean DEFAULT true,   -- true = keyed-user cohort; false = ALL users
  p_limit       integer DEFAULT 5000    -- max beliefs deactivated per call (re-run to continue)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now            timestamptz := now();
  v_cohort         uuid[] := public.mnemos_cohort();
  v_active_total   bigint;
  v_would_retire   bigint;
  v_committed      bigint := 0;
  v_sample_retire  jsonb;
  v_sample_keep    jsonb;
BEGIN
  -- read-only census over the scope (active beliefs only — we only ever DEACTIVATE)
  SELECT
    count(*),
    count(*) FILTER (WHERE public.mnemos_belief_is_legacy_pollution(b.source, b.content))
  INTO v_active_total, v_would_retire
  FROM beliefs b
  WHERE b.active = true
    AND (NOT p_cohort_only OR b.user_id = ANY(v_cohort));

  -- a sample of what would be RETIRED (so the predicate is visibly correct)
  SELECT jsonb_agg(row_to_json(t)) INTO v_sample_retire FROM (
    SELECT left(b.content, 200) AS content, b.source,
           round(b.confidence::numeric, 2) AS confidence, b.agent_id, b.created_at
    FROM beliefs b
    WHERE b.active = true
      AND (NOT p_cohort_only OR b.user_id = ANY(v_cohort))
      AND public.mnemos_belief_is_legacy_pollution(b.source, b.content)
    ORDER BY b.confidence DESC NULLS LAST, b.created_at DESC
    LIMIT 30
  ) t;

  -- the flip side: a sample of what SURVIVES (synthesized + genuinely abstracted),
  -- so you can confirm the cleanup keeps the real beliefs, not just culls everything.
  SELECT jsonb_agg(row_to_json(t)) INTO v_sample_keep FROM (
    SELECT left(b.content, 200) AS content, b.source,
           round(b.confidence::numeric, 2) AS confidence, b.agent_id, b.created_at
    FROM beliefs b
    WHERE b.active = true
      AND (NOT p_cohort_only OR b.user_id = ANY(v_cohort))
      AND NOT public.mnemos_belief_is_legacy_pollution(b.source, b.content)
    ORDER BY b.confidence DESC NULLS LAST, b.created_at DESC
    LIMIT 30
  ) t;

  IF p_commit THEN
    IF NOT pg_try_advisory_xact_lock(hashtext('mnemos_cleanup_legacy_beliefs')) THEN
      RETURN jsonb_build_object('ran_at', v_now, 'skipped', 'already_running');
    END IF;
    WITH batch AS (
      SELECT b.id
      FROM beliefs b
      WHERE b.active = true
        AND (NOT p_cohort_only OR b.user_id = ANY(v_cohort))
        AND public.mnemos_belief_is_legacy_pollution(b.source, b.content)
      ORDER BY b.id  -- deterministic; re-run to continue
      LIMIT p_limit
    ),
    upd AS (
      UPDATE beliefs b SET
        active          = false,
        -- reversible provenance: UPDATE beliefs SET active=true, auto_activation=NULL
        -- WHERE auto_activation->>'reason'='legacy_pollution_cleanup';
        auto_activation = jsonb_build_object(
                            'decision', 'deactivated',
                            'reason',   'legacy_pollution_cleanup',
                            'at',       v_now),
        updated_at      = v_now
      FROM batch x
      WHERE b.id = x.id
        AND b.active = true
      RETURNING 1
    )
    SELECT count(*) INTO v_committed FROM upd;
  END IF;

  RETURN jsonb_build_object(
    'mode',                  CASE WHEN p_commit THEN 'commit' ELSE 'dry_run' END,
    'ran_at',                v_now,
    'cohort_only',           p_cohort_only,
    'active_beliefs_total',  v_active_total,
    'would_retire',          v_would_retire,
    'would_keep',            v_active_total - v_would_retire,
    'committed_this_batch',  v_committed,
    'estimated_remaining',   GREATEST(v_would_retire - v_committed, 0),
    'sample_would_retire',   COALESCE(v_sample_retire, '[]'::jsonb),
    'sample_would_keep',     COALESCE(v_sample_keep, '[]'::jsonb)
  );
END;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.mnemos_cohort() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_belief_is_legacy_pollution(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_cleanup_legacy_beliefs(boolean, boolean, integer) TO service_role;
GRANT SELECT ON public.mnemos_belief_review_queue TO service_role;
