-- Mnemos Phase 4 — auto-activation of synthesized beliefs + widen cohort + cleanup helpers

ALTER TABLE public.beliefs ADD COLUMN IF NOT EXISTS auto_activation jsonb;

CREATE INDEX IF NOT EXISTS idx_beliefs_synth_automanaged
  ON public.beliefs(user_id, agent_id)
  WHERE source = 'llm_synthesis' AND auto_activation IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mnemos_cohort()
RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[])
  FROM public.user_api_keys
$$;

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

CREATE OR REPLACE FUNCTION public.mnemos_cleanup_legacy_beliefs(
  p_commit      boolean DEFAULT false,
  p_cohort_only boolean DEFAULT true,
  p_limit       integer DEFAULT 5000
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
  SELECT
    count(*),
    count(*) FILTER (WHERE public.mnemos_belief_is_legacy_pollution(b.source, b.content))
  INTO v_active_total, v_would_retire
  FROM beliefs b
  WHERE b.active = true
    AND (NOT p_cohort_only OR b.user_id = ANY(v_cohort));

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
      ORDER BY b.id
      LIMIT p_limit
    ),
    upd AS (
      UPDATE beliefs b SET
        active          = false,
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

GRANT EXECUTE ON FUNCTION public.mnemos_cohort() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_belief_is_legacy_pollution(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_cleanup_legacy_beliefs(boolean, boolean, integer) TO service_role;
GRANT SELECT ON public.mnemos_belief_review_queue TO service_role;