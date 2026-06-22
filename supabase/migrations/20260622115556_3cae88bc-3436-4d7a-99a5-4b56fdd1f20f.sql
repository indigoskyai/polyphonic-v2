-- 20260622160000_mnemos_digest_review.sql
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
    'cd557ff7-57ab-48c6-b5a3-a9432d1159ab',
    '47299895-1796-4dbd-95a1-9b6f2fbe97eb',
    '2c1fd658-4a4f-4ee6-b2eb-88ba4a8019be',
    '33d6d9f8-be8b-48f7-8899-33cc60939f82',
    'a085f84f-8457-4274-bee4-f3f6b9c3d865',
    '26063e00-d5f1-48ef-a775-81979de987ac',
    '4413f702-d6b3-4680-bd51-42d9049785a3',
    '2f5cf107-fc39-4283-99e0-5a3b2e60071e'
  ]::uuid[];
  v_now       timestamptz := now();
  v_sensitive text[] := public.mnemos_digest_sensitive_tags();
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
        AND COALESCE(e.surprise_score, 1) <= p_surprise_max
        AND ABS(COALESCE(e.emotional_arousal, 1.0)) <= p_arousal_max
        AND NOT (COALESCE(e.tags, ARRAY[]::text[]) && v_sensitive)
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

SELECT cron.unschedule('mnemos-digest-build-cohort')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-digest-build-cohort');
SELECT cron.schedule('mnemos-digest-build-cohort', '0 3 * * *',
  $$SELECT public.mnemos_run_digest_build_cohort()$$);

SELECT cron.unschedule('mnemos-digest-autoreview')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-digest-autoreview');
SELECT cron.schedule('mnemos-digest-autoreview', '20 3 * * *',
  $$SELECT public.mnemos_run_digest_autoreview_cohort()$$);