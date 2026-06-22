-- Mnemos Tier 2/3 · Phase 3b — historical backlog drain (dry-run-first).
--
-- Phase 3 (20260622160000) only reviews engrams GOING FORWARD (cohort open
-- digests, nightly). It leaves the ~35k pre-existing UNREVIEWED engrams — months
-- of accumulated memory stuck in review limbo — untouched. Clearing them is a
-- large one-time mutation on live data (incl. crisis-capable users), so it must
-- be provably correct BEFORE it runs across everything.
--
-- KEYSTONE — one decision rule, three callers. The nightly reviewer, the dry-run
-- preview, and the real drain all call the SAME predicate (mnemos_engram_
-- autoconfirmable). What you preview is byte-for-byte what commits; they cannot
-- drift. This migration also refactors the nightly reviewer onto that predicate
-- (behavior-identical) and onto a single cohort source (mnemos_cohort).
--
-- SAFETY — mnemos_digest_backlog_drain is DRY-RUN by default (p_commit=false):
-- it writes NOTHING and returns counts + the RISKIEST would-confirms (the ones
-- closest to the surprise/arousal ceilings — where a wrong floor shows up first).
-- Inspect those; only when they're unambiguously mundane do you re-run with
-- p_commit=true. Defaults to cohort-only; widen to all users explicitly. Batched
-- (p_limit) and idempotent (reviewed_at re-check + advisory lock). Like the
-- nightly path it mirrors the human confirm (reviewed_at, decision='confirmed',
-- proportional stability lift) and NEVER touches access_count or auto-rejects.
-- It is engram-level: backlog engrams outlived their digests, so it does NOT
-- touch mnemos_digests (those are already retired; their reviewed_count is moot).

-- ── single source of truth: the dark-launch cohort ─────────────────────────────
CREATE OR REPLACE FUNCTION public.mnemos_cohort()
RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'cd557ff7-57ab-48c6-b5a3-a9432d1159ab', -- mistski
    '47299895-1796-4dbd-95a1-9b6f2fbe97eb', -- karen
    '2c1fd658-4a4f-4ee6-b2eb-88ba4a8019be', -- mich.killen
    '33d6d9f8-be8b-48f7-8899-33cc60939f82', -- Riley
    'a085f84f-8457-4274-bee4-f3f6b9c3d865', -- twsherrard83
    '26063e00-d5f1-48ef-a775-81979de987ac', -- gaiaskyarcanum
    '4413f702-d6b3-4680-bd51-42d9049785a3', -- aureliavespera694
    '2f5cf107-fc39-4283-99e0-5a3b2e60071e'  -- halliebkup
  ]::uuid[]
$$;

-- ── single source of truth: the auto-confirm decision rule ─────────────────────
-- TRUE iff an engram is safe to machine-confirm: present-and-low surprise (NULL
-- → 1 = high → false), present-and-low |arousal| (NULL → 1.0 = high → false,
-- symmetric with surprise), and no sensitive tag (NULL/empty tags can't error).
CREATE OR REPLACE FUNCTION public.mnemos_engram_autoconfirmable(
  p_surprise     double precision,
  p_arousal      double precision,
  p_tags         text[],
  p_surprise_max numeric DEFAULT 0.35,
  p_arousal_max  numeric DEFAULT 0.40
-- STABLE (not IMMUTABLE): it calls mnemos_digest_sensitive_tags(), and STABLE is
-- the strict-but-safe label for a function that delegates to another. It's only
-- used in WHERE clauses (no index), so IMMUTABLE buys nothing here — and STABLE
-- lets us keep ONE sensitive-tag list instead of duplicating the array inline.
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_surprise, 1) <= p_surprise_max
     AND ABS(COALESCE(p_arousal, 1.0)) <= p_arousal_max
     AND NOT (COALESCE(p_tags, ARRAY[]::text[]) && public.mnemos_digest_sensitive_tags());
$$;

-- ── refactor the nightly reviewer onto the shared predicate (behavior-identical) ─
CREATE OR REPLACE FUNCTION public.mnemos_run_digest_autoreview_cohort(
  p_surprise_max numeric DEFAULT 0.35,
  p_arousal_max  numeric DEFAULT 0.40
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort    uuid[] := public.mnemos_cohort();
  v_now       timestamptz := now();
  r           record;
  v_confirmed integer;
  v_total     integer := 0;
  v_digests   integer := 0;
  v_finalized integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('mnemos_digest_autoreview_cohort')) THEN
    RETURN jsonb_build_object('ran_at', v_now, 'skipped', 'already_running');
  END IF;

  FOR r IN
    SELECT id FROM mnemos_digests
    WHERE user_id = ANY(v_cohort) AND status = 'open'
  LOOP
    WITH confirmable AS (
      SELECT e.id
      FROM engrams e
      WHERE e.digest_id = r.id
        AND e.reviewed_at IS NULL
        AND public.mnemos_engram_autoconfirmable(
              e.surprise_score, e.emotional_arousal, e.tags, p_surprise_max, p_arousal_max)
    ),
    upd AS (
      UPDATE engrams e SET
        reviewed_at     = v_now,
        review_decision = 'confirmed',
        review_note     = 'auto: low-surprise, non-sensitive (cohort dark-launch)',
        stability       = LEAST(1.0, round((COALESCE(e.stability, 0) + 0.15 * (1 - COALESCE(e.stability, 0)))::numeric, 4))
      FROM confirmable c
      WHERE e.id = c.id
        AND e.reviewed_at IS NULL
      RETURNING 1
    )
    SELECT count(*) INTO v_confirmed FROM upd;

    IF v_confirmed > 0 THEN
      UPDATE mnemos_digests d SET
        reviewed_count = COALESCE(d.reviewed_count, 0) + v_confirmed,
        status = CASE
          WHEN NOT EXISTS (SELECT 1 FROM engrams e WHERE e.digest_id = d.id AND e.reviewed_at IS NULL)
          THEN 'finalized' ELSE d.status END,
        finalized_at = CASE
          WHEN NOT EXISTS (SELECT 1 FROM engrams e WHERE e.digest_id = d.id AND e.reviewed_at IS NULL)
          THEN v_now ELSE d.finalized_at END
      WHERE d.id = r.id;

      IF NOT EXISTS (SELECT 1 FROM engrams e WHERE e.digest_id = r.id AND e.reviewed_at IS NULL) THEN
        v_finalized := v_finalized + 1;
      END IF;
      v_total := v_total + v_confirmed;
    END IF;
    v_digests := v_digests + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ran_at', v_now, 'digests_scanned', v_digests,
    'auto_confirmed', v_total, 'digests_finalized', v_finalized
  );
END;
$$;

-- ── the backlog drain: dry-run by default, commit only when proven ─────────────
CREATE OR REPLACE FUNCTION public.mnemos_digest_backlog_drain(
  p_commit       boolean DEFAULT false,  -- false = dry-run (zero writes); true = apply one batch
  p_cohort_only  boolean DEFAULT true,   -- true = 8 power users; false = ALL users
  p_limit        integer DEFAULT 5000,   -- max engrams committed per call (re-run to continue)
  p_surprise_max numeric DEFAULT 0.35,
  p_arousal_max  numeric DEFAULT 0.40
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now              timestamptz := now();
  v_cohort           uuid[] := public.mnemos_cohort();
  v_total_unreviewed bigint;
  v_would_confirm    bigint;
  v_committed        bigint := 0;
  v_riskiest         jsonb;
  v_high_arousal     jsonb;
  v_escalate         jsonb;
BEGIN
  -- read-only census over the scope (active/consolidating only — matches the
  -- digest-build candidate set; dormant/archived are intentionally left alone)
  SELECT
    count(*),
    count(*) FILTER (WHERE public.mnemos_engram_autoconfirmable(
             e.surprise_score, e.emotional_arousal, e.tags, p_surprise_max, p_arousal_max))
  INTO v_total_unreviewed, v_would_confirm
  FROM engrams e
  WHERE e.reviewed_at IS NULL
    AND e.state IN ('active','consolidating')
    AND (NOT p_cohort_only OR e.user_id = ANY(v_cohort));

  -- boundary inspection: the would-confirms CLOSEST to the ceilings (riskiest)
  SELECT jsonb_agg(row_to_json(t)) INTO v_riskiest FROM (
    SELECT left(e.content, 240) AS content, e.surprise_score, e.emotional_arousal,
           e.tags, e.engram_type, e.created_at
    FROM engrams e
    WHERE e.reviewed_at IS NULL
      AND e.state IN ('active','consolidating')
      AND (NOT p_cohort_only OR e.user_id = ANY(v_cohort))
      AND public.mnemos_engram_autoconfirmable(
            e.surprise_score, e.emotional_arousal, e.tags, p_surprise_max, p_arousal_max)
    ORDER BY COALESCE(e.surprise_score, 0) DESC, ABS(COALESCE(e.emotional_arousal, 0)) DESC
    LIMIT 30
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_high_arousal FROM (
    SELECT left(e.content, 240) AS content, e.surprise_score, e.emotional_arousal,
           e.tags, e.engram_type, e.created_at
    FROM engrams e
    WHERE e.reviewed_at IS NULL
      AND e.state IN ('active','consolidating')
      AND (NOT p_cohort_only OR e.user_id = ANY(v_cohort))
      AND public.mnemos_engram_autoconfirmable(
            e.surprise_score, e.emotional_arousal, e.tags, p_surprise_max, p_arousal_max)
    ORDER BY ABS(COALESCE(e.emotional_arousal, 0)) DESC, COALESCE(e.surprise_score, 0) DESC
    LIMIT 30
  ) t;

  -- the flip side: what we'd HOLD BACK for a human (the riskiest escalations).
  -- Lets us confirm the floor isn't over-escalating obvious mundane content, and
  -- that the charged/sensitive material is correctly landing here, not in confirm.
  SELECT jsonb_agg(row_to_json(t)) INTO v_escalate FROM (
    SELECT left(e.content, 240) AS content, e.surprise_score, e.emotional_arousal,
           e.tags, e.engram_type, e.created_at
    FROM engrams e
    WHERE e.reviewed_at IS NULL
      AND e.state IN ('active','consolidating')
      AND (NOT p_cohort_only OR e.user_id = ANY(v_cohort))
      AND NOT public.mnemos_engram_autoconfirmable(
            e.surprise_score, e.emotional_arousal, e.tags, p_surprise_max, p_arousal_max)
    ORDER BY COALESCE(e.surprise_score, 0) DESC, ABS(COALESCE(e.emotional_arousal, 0)) DESC
    LIMIT 30
  ) t;

  IF p_commit THEN
    IF NOT pg_try_advisory_xact_lock(hashtext('mnemos_digest_backlog_drain')) THEN
      RETURN jsonb_build_object('ran_at', v_now, 'skipped', 'already_running');
    END IF;
    WITH batch AS (
      SELECT e.id
      FROM engrams e
      WHERE e.reviewed_at IS NULL
        AND e.state IN ('active','consolidating')
        AND (NOT p_cohort_only OR e.user_id = ANY(v_cohort))
        AND public.mnemos_engram_autoconfirmable(
              e.surprise_score, e.emotional_arousal, e.tags, p_surprise_max, p_arousal_max)
      -- SAME risk order as the dry-run sample, so a single committed batch is
      -- exactly the head of what you inspected (riskiest first); deterministic
      -- tiebreak by id so re-runs are stable. NOT created_at — that would commit
      -- a different, un-previewed set than the sample shows.
      ORDER BY COALESCE(e.surprise_score, 0) DESC, ABS(COALESCE(e.emotional_arousal, 0)) DESC, e.id
      LIMIT p_limit
    ),
    upd AS (
      UPDATE engrams e SET
        reviewed_at     = v_now,
        review_decision = 'confirmed',
        review_note     = 'auto: backlog-drain (low-surprise, non-sensitive)',
        -- deliberately NOT touching last_accessed_at: a review is a triage
        -- decision, not a retrieval (matches the human confirm path). Bumping it
        -- would re-enter 35k old engrams into the consolidation/belief-candidate
        -- recency window all at once and distort it. access_count untouched too.
        stability       = LEAST(1.0, round((COALESCE(e.stability, 0) + 0.15 * (1 - COALESCE(e.stability, 0)))::numeric, 4))
      FROM batch b
      WHERE e.id = b.id
        AND e.reviewed_at IS NULL
      RETURNING 1
    )
    SELECT count(*) INTO v_committed FROM upd;
  END IF;

  RETURN jsonb_build_object(
    'mode',                CASE WHEN p_commit THEN 'commit' ELSE 'dry_run' END,
    'ran_at',              v_now,
    'cohort_only',         p_cohort_only,
    'surprise_max',        p_surprise_max,
    'arousal_max',         p_arousal_max,
    'total_unreviewed',    v_total_unreviewed,
    'would_auto_confirm',  v_would_confirm,
    'would_escalate',      v_total_unreviewed - v_would_confirm,
    'committed_this_batch', v_committed,
    'estimated_remaining', GREATEST(v_would_confirm - v_committed, 0),
    'sample_riskiest_by_surprise', COALESCE(v_riskiest, '[]'::jsonb),
    'sample_riskiest_by_arousal',  COALESCE(v_high_arousal, '[]'::jsonb),
    'sample_would_escalate',       COALESCE(v_escalate, '[]'::jsonb)
  );
END;
$$;

-- re-grant the shared dependency explicitly (already granted in 20260622160000;
-- repeated here so this migration is self-contained and the call path is obvious)
GRANT EXECUTE ON FUNCTION public.mnemos_digest_sensitive_tags() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_cohort() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_engram_autoconfirmable(double precision, double precision, text[], numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_digest_backlog_drain(boolean, boolean, integer, numeric, numeric) TO service_role;
