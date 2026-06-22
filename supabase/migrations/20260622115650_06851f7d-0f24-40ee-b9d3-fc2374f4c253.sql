-- Mnemos Tier 2/3 · Phase 3b — historical backlog drain (dry-run-first).

CREATE OR REPLACE FUNCTION public.mnemos_cohort()
RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'cd557ff7-57ab-48c6-b5a3-a9432d1159ab',
    '47299895-1796-4dbd-95a1-9b6f2fbe97eb',
    '2c1fd658-4a4f-4ee6-b2eb-88ba4a8019be',
    '33d6d9f8-be8b-48f7-8899-33cc60939f82',
    'a085f84f-8457-4274-bee4-f3f6b9c3d865',
    '26063e00-d5f1-48ef-a775-81979de987ac',
    '4413f702-d6b3-4680-bd51-42d9049785a3',
    '2f5cf107-fc39-4283-99e0-5a3b2e60071e'
  ]::uuid[]
$$;

CREATE OR REPLACE FUNCTION public.mnemos_engram_autoconfirmable(
  p_surprise     double precision,
  p_arousal      double precision,
  p_tags         text[],
  p_surprise_max numeric DEFAULT 0.35,
  p_arousal_max  numeric DEFAULT 0.40
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(p_surprise, 1) <= p_surprise_max
     AND ABS(COALESCE(p_arousal, 1.0)) <= p_arousal_max
     AND NOT (COALESCE(p_tags, ARRAY[]::text[]) && public.mnemos_digest_sensitive_tags());
$$;

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

CREATE OR REPLACE FUNCTION public.mnemos_digest_backlog_drain(
  p_commit       boolean DEFAULT false,
  p_cohort_only  boolean DEFAULT true,
  p_limit        integer DEFAULT 5000,
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
  SELECT
    count(*),
    count(*) FILTER (WHERE public.mnemos_engram_autoconfirmable(
             e.surprise_score, e.emotional_arousal, e.tags, p_surprise_max, p_arousal_max))
  INTO v_total_unreviewed, v_would_confirm
  FROM engrams e
  WHERE e.reviewed_at IS NULL
    AND e.state IN ('active','consolidating')
    AND (NOT p_cohort_only OR e.user_id = ANY(v_cohort));

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
      ORDER BY COALESCE(e.surprise_score, 0) DESC, ABS(COALESCE(e.emotional_arousal, 0)) DESC, e.id
      LIMIT p_limit
    ),
    upd AS (
      UPDATE engrams e SET
        reviewed_at     = v_now,
        review_decision = 'confirmed',
        review_note     = 'auto: backlog-drain (low-surprise, non-sensitive)',
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

GRANT EXECUTE ON FUNCTION public.mnemos_digest_sensitive_tags() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_cohort() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_engram_autoconfirmable(double precision, double precision, text[], numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_digest_backlog_drain(boolean, boolean, integer, numeric, numeric) TO service_role;