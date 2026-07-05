-- Polyphonic Mnemos repair contracts.
ALTER TABLE public.memory_settings
  ADD COLUMN IF NOT EXISTS full_cognition_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS softening_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS softening_dry_run boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.mnemos_cohort()
RETURNS uuid[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(k.user_id), ARRAY[]::uuid[])
  FROM public.user_api_keys k
  JOIN public.memory_settings ms ON ms.user_id = k.user_id
  WHERE ms.mnemos_enabled IS DISTINCT FROM false
    AND ms.full_cognition_enabled IS true
$$;

GRANT EXECUTE ON FUNCTION public.mnemos_cohort() TO service_role;

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS last_rehearsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS affect_source text NOT NULL DEFAULT 'heuristic',
  ADD COLUMN IF NOT EXISTS digest_suggestion_action text,
  ADD COLUMN IF NOT EXISTS digest_suggestion_reason text,
  ADD COLUMN IF NOT EXISTS digest_suggestion_confidence numeric,
  ADD COLUMN IF NOT EXISTS digest_suggested_by text,
  ADD COLUMN IF NOT EXISTS digest_suggestion_model text,
  ADD COLUMN IF NOT EXISTS digest_suggestion_generated_at timestamptz;

ALTER TABLE public.engrams
  DROP CONSTRAINT IF EXISTS engrams_reviewed_by_check,
  ADD CONSTRAINT engrams_reviewed_by_check
    CHECK (reviewed_by IS NULL OR reviewed_by IN ('user', 'auto', 'agent', 'unknown'));

ALTER TABLE public.engrams
  DROP CONSTRAINT IF EXISTS engrams_affect_source_check,
  ADD CONSTRAINT engrams_affect_source_check
    CHECK (affect_source IN ('model', 'heuristic', 'unknown'));

ALTER TABLE public.engrams
  DROP CONSTRAINT IF EXISTS engrams_digest_suggestion_action_check,
  ADD CONSTRAINT engrams_digest_suggestion_action_check
    CHECK (digest_suggestion_action IS NULL OR digest_suggestion_action IN ('keep', 'release', 'distill'));

ALTER TABLE public.engrams
  DROP CONSTRAINT IF EXISTS engrams_digest_suggestion_confidence_check,
  ADD CONSTRAINT engrams_digest_suggestion_confidence_check
    CHECK (digest_suggestion_confidence IS NULL OR digest_suggestion_confidence BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS idx_engrams_last_rehearsed
  ON public.engrams (user_id, agent_id, last_rehearsed_at)
  WHERE state IN ('active','dormant','consolidating');

CREATE INDEX IF NOT EXISTS idx_engrams_reviewed_by
  ON public.engrams (user_id, reviewed_by, reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;

UPDATE public.engrams
SET reviewed_by = CASE
  WHEN review_note ILIKE 'auto:%' THEN 'auto'
  WHEN reviewed_by IS NULL THEN 'unknown'
  ELSE reviewed_by
END
WHERE reviewed_at IS NOT NULL
  AND reviewed_by IS NULL;

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS formed_by text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_connection_type_check,
  ADD CONSTRAINT connections_connection_type_check
    CHECK (connection_type IN (
      'supports', 'contradicts', 'causes', 'extends', 'parallels',
      'synthesizes', 'grounds', 'co_occurs'
    ));

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_formed_by_check,
  ADD CONSTRAINT connections_formed_by_check
    CHECK (formed_by IN ('explicit', 'heuristic', 'classifier', 'manual', 'import', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_connections_formed_by_type
  ON public.connections (user_id, agent_id, formed_by, connection_type);

CREATE OR REPLACE FUNCTION public.mnemos_reconsolidate(
  p_engram_ids uuid[],
  p_user_id uuid,
  p_agent_id text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_engram_ids IS NULL OR array_length(p_engram_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH target AS (
    SELECT DISTINCT unnest(p_engram_ids) AS id
  ),
  upd AS (
    UPDATE public.engrams e SET
      last_accessed_at = now(),
      access_count = COALESCE(e.access_count, 0) + 1,
      strength = LEAST(1.0, round((COALESCE(e.strength, 0) + 0.05)::numeric, 4)),
      stability = LEAST(1.0, round((COALESCE(e.stability, 0) + 0.05 * (1 - COALESCE(e.stability, 0)))::numeric, 4)),
      accessibility = LEAST(1.0, round((COALESCE(e.accessibility, 0) + 0.1)::numeric, 4)),
      state = CASE WHEN e.state = 'dormant' THEN 'active' ELSE e.state END,
      updated_at = now()
    FROM target t
    WHERE e.id = t.id
      AND e.user_id = p_user_id
      AND e.agent_id = p_agent_id
      AND e.state <> 'archived'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mnemos_reconsolidate(uuid[], uuid, text) TO service_role;

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
    SELECT e.id, e.rehearse_count, e.last_rehearsed_at, e.last_accessed_at,
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
      AND e.state IN ('active','consolidating')
      AND e.created_at <= v_now - interval '72 hours'
  ),
  eligible AS (
    SELECT id, GREATEST(base_value, CASE WHEN belief_linked THEN 0.7 ELSE 0 END) AS value
    FROM candidates
    WHERE COALESCE(last_rehearsed_at, last_accessed_at, '-infinity'::timestamptz)
       < v_now - (interval '24 hours' * power(2, LEAST(COALESCE(rehearse_count, 0), 6)))
  ),
  picked AS (
    SELECT id FROM eligible WHERE value >= p_value_floor ORDER BY value DESC LIMIT p_budget
  ),
  upd AS (
    UPDATE engrams e SET
      stability        = LEAST(1.0, round((COALESCE(e.stability, 0) + 0.05 * (1 - COALESCE(e.stability, 0)))::numeric, 4)),
      rehearse_count   = COALESCE(e.rehearse_count, 0) + 1,
      last_rehearsed_at = v_now,
      updated_at       = v_now
    FROM picked p WHERE e.id = p.id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mnemos_run_rehearsal_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort uuid[] := public.mnemos_cohort();
  r        record;
  v_n      integer;
  v_total  integer := 0;
  v_scopes integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, agent_id FROM engrams
    WHERE user_id = ANY(v_cohort) AND state IN ('active','consolidating')
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

NOTIFY pgrst, 'reload schema';
