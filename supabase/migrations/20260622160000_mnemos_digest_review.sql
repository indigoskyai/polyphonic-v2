-- Mnemos Tier 2/3 · Phase 3 — digest auto-review (the reviewer that never ran).
--
-- ROOT CAUSE this attacks: review coverage was 2.19%. mnemos-digest-build was
-- never scheduled (only the UI called it), and its "auto-finalize" stamped every
-- stale digest "auto_finalized" regardless of review — 430/439 digests in prod
-- were marked finalized with ZERO reviews. So engrams piled up unreviewed, never
-- got the confirm-time durability lift, and the digest surface looked "done"
-- while nothing had actually been triaged. The honest-retirement half of this fix
-- lives in the edge fn (mnemos-digest-build: unreviewed stale → 'expired', not
-- 'auto_finalized'); this migration adds the two missing schedulers + the
-- automated reviewer itself.
--
-- DESIGN — deterministic, never an LLM. The reviewer auto-CONFIRMS only engrams
-- that clear ALL of: a present, low surprise score (<= surprise_max; NULL surprise
-- → treated as 1 = high → escalates); a present, low |arousal| (<= arousal_max;
-- NULL arousal → treated as 1.0 = high → escalates, symmetric with surprise so
-- unscored/legacy/imported engrams never slip through); and NO sensitive tag.
-- (We deliberately do NOT require a non-empty tag set: the main encode path
-- defaults tags to '{}', so requiring tags would neuter coverage — the two
-- present-and-low numeric gates are the primary floor, the tag set is a veto
-- belt, and charged content reliably scores high arousal/surprise.) NEVER auto-REJECTS
-- (rejection archives + zeroes accessibility — destructive), and it ESCALATES
-- everything it doesn't confirm by leaving it unreviewed for a human. No model
-- ever judges crisis/identity/medical content; the numeric floor is the primary
-- gate (such memories score high surprise/arousal) and the sensitive-tag veto is
-- a second belt. It sets reviewed_at + review_decision='confirmed' like the human
-- path, but lifts stability PROPORTIONALLY (0.15*(1-stability), rehearsal's curve)
-- not the human path's flat +0.15 — a machine bulk-confirm must not out-durable a
-- meaningful engram a human hasn't reached. It does NOT touch access_count —
-- promotion to semantic gates on access_count>=3, and a machine must not
-- auto-promote episodic (incl. therapeutic) memory, same rule as rehearsal.
--
-- Pure-SQL (like rehearsal / belief-challenge): one indexed pass per cohort
-- digest, no LLM, no per-engram edge invoke. COHORT-GATED to the 8 power users
-- for dark-launch. SAFETY-FLOOR DIALS (surprise_max 0.35, arousal_max 0.40,
-- sensitive-tag set) are intentionally conservative and flagged for sign-off.

-- ── safety floor: which engrams are mundane enough to auto-confirm ──────────────
-- Tags that veto auto-confirm regardless of surprise/arousal (belt-and-suspenders;
-- the numeric floor already excludes most charged content). Auto-confirm requires
-- the engram carry NONE of these.
--   crisis-adjacent · identity/self · medical/health · relational · commitments
CREATE OR REPLACE FUNCTION public.mnemos_digest_sensitive_tags()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'crisis','self_harm','suicide','suicidal_ideation','overdose','emergency',
    'trauma','grief','abuse',
    'identity','self','value','belief','boundary',
    'medical','health','diagnosis','mental_health','hospital',
    'therapy','therapeutic','counseling','medication','treatment','symptom',
    'anxiety','anxious','depression','depressed','panic',
    'relationship','family','partner','intimacy',
    'promise','commitment','milestone','decision'
  ]::text[]
$$;

-- ── per-call cohort auto-review ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mnemos_run_digest_autoreview_cohort(
  p_surprise_max numeric DEFAULT 0.35,
  p_arousal_max  numeric DEFAULT 0.40
) RETURNS jsonb
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
  v_now       timestamptz := now();
  v_sensitive text[] := public.mnemos_digest_sensitive_tags();
  r           record;
  v_confirmed integer;
  v_total     integer := 0;
  v_digests   integer := 0;
  v_finalized integer := 0;
BEGIN
  -- Serialize: pg_cron won't overlap a same-named job, but a manual invocation
  -- during the 03:20 window could. Skip rather than risk double-counting
  -- reviewed_count (the reviewed_at guard below makes the engram writes
  -- idempotent regardless, so skipping is safe).
  IF NOT pg_try_advisory_xact_lock(hashtext('mnemos_digest_autoreview_cohort')) THEN
    RETURN jsonb_build_object('ran_at', v_now, 'skipped', 'already_running');
  END IF;

  FOR r IN
    SELECT id FROM mnemos_digests
    WHERE user_id = ANY(v_cohort) AND status = 'open'
  LOOP
    -- Auto-confirm the unambiguously-mundane engrams stamped to this digest.
    -- Safety floor (all must hold): a present, low surprise score (NULL → 1 =
    -- high → escalates); a present, low |arousal| (NULL → 1.0 = high → escalates,
    -- symmetric with surprise so unscored/legacy/imported engrams never slip
    -- through); and no sensitive tag. NOTE: we do NOT require a non-empty tag set
    -- — the main encode path defaults tags to '{}' (encoding.ts), so requiring
    -- tags would neuter auto-review on the bulk conversational path. The two
    -- numeric gates (both must be present AND low) are the primary floor; sensitive
    -- content reliably scores high arousal/surprise via encoding, and the tag set
    -- is a veto belt. COALESCE keeps NULL/empty tags from erroring the overlap.
    WITH confirmable AS (
      SELECT e.id
      FROM engrams e
      WHERE e.digest_id = r.id
        AND e.reviewed_at IS NULL
        AND COALESCE(e.surprise_score, 1) <= p_surprise_max
        AND ABS(COALESCE(e.emotional_arousal, 1.0)) <= p_arousal_max
        AND NOT (COALESCE(e.tags, ARRAY[]::text[]) && v_sensitive)
    ),
    upd AS (
      UPDATE engrams e SET
        reviewed_at     = v_now,
        review_decision = 'confirmed',
        review_note     = 'auto: low-surprise, non-sensitive (cohort dark-launch)',
        -- proportional lift (diminishing returns), NOT the human path's flat
        -- +0.15: a machine bulk-confirm of mundane engrams must not out-durable
        -- a meaningful engram a human hasn't gotten to yet. Matches rehearsal's curve.
        stability       = LEAST(1.0, round((COALESCE(e.stability, 0) + 0.15 * (1 - COALESCE(e.stability, 0)))::numeric, 4))
      FROM confirmable c
      WHERE e.id = c.id
        AND e.reviewed_at IS NULL   -- re-check: a human review may have landed since the CTE snapshot
      RETURNING 1
    )
    SELECT count(*) INTO v_confirmed FROM upd;

    IF v_confirmed > 0 THEN
      -- bump reviewed_count; finalize ONLY if nothing is left for a human to see
      -- (digests with escalated sensitive/high-surprise engrams stay 'open')
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

-- ── cohort build driver: invoke the existing build edge fn per cohort scope ─────
-- Keeps build logic single-sourced in the edge fn; just schedules it for the
-- cohort nightly so digests exist to review (the UI only builds on demand).
CREATE OR REPLACE FUNCTION public.mnemos_run_digest_build_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort uuid[] := ARRAY[
    'cd557ff7-57ab-48c6-b5a3-a9432d1159ab',
    '47299895-1796-4dbd-95a1-9b6f2fbe97eb',
    '2c1fd658-4a4f-4ee6-b2eb-88ba4a8019be',
    '33d6d9f8-be8b-48f7-8899-33cc60939f82',
    'a085f84f-8457-4274-bee4-f3f6b9c3d865',
    '26063e00-d5f1-48ef-a775-81979de987ac',
    '4413f702-d6b3-4680-bd51-42d9049785a3',
    '2f5cf107-fc39-4283-99e0-5a3b2e60071e'
  ]::uuid[];
  r         record;
  v_invoked integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, COALESCE(agent_id, 'luca') AS agent_id
    FROM engrams
    WHERE user_id = ANY(v_cohort)
      AND created_at >= now() - interval '24 hours'
  LOOP
    PERFORM public.invoke_edge_function(
      'mnemos-digest-build',
      jsonb_build_object('user_id', r.user_id, 'agent_id', r.agent_id)
    );
    v_invoked := v_invoked + 1;
  END LOOP;
  RETURN jsonb_build_object('ran_at', now(), 'scopes_invoked', v_invoked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mnemos_digest_sensitive_tags() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_run_digest_autoreview_cohort(numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_run_digest_build_cohort() TO service_role;

-- ── schedule: build at 03:00, auto-review at 03:20 (after builds settle) ────────
SELECT cron.unschedule('mnemos-digest-build-cohort')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-digest-build-cohort');
SELECT cron.schedule('mnemos-digest-build-cohort', '0 3 * * *',
  $$SELECT public.mnemos_run_digest_build_cohort()$$);

SELECT cron.unschedule('mnemos-digest-autoreview')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-digest-autoreview');
SELECT cron.schedule('mnemos-digest-autoreview', '20 3 * * *',
  $$SELECT public.mnemos_run_digest_autoreview_cohort()$$);
