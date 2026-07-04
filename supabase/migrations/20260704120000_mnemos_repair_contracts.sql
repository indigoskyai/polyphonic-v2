-- Polyphonic Mnemos repair contracts.
--
-- Additive runtime fixes for the Fable/Codex amended review:
-- - explicit full-cognition consent separate from BYOK
-- - honest connection provenance and weak co-occurrence edges
-- - rehearsal metadata that is separate from human retrieval
-- - digest review attribution and Luca preview suggestions
-- - dry-run softening proposals
-- - continuity ledger events

-- ---------------------------------------------------------------------------
-- Consent and user-controlled full cognition
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Engram review, affect, rehearsal, and Luca preview metadata
-- ---------------------------------------------------------------------------

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

-- Backfill explicit attribution where current rows are already reviewed.
UPDATE public.engrams
SET reviewed_by = CASE
  WHEN review_note ILIKE 'auto:%' THEN 'auto'
  WHEN reviewed_by IS NULL THEN 'unknown'
  ELSE reviewed_by
END
WHERE reviewed_at IS NOT NULL
  AND reviewed_by IS NULL;

-- ---------------------------------------------------------------------------
-- Connection honesty
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Atomic reconsolidation RPC
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Rehearsal: machine rereading is not human recall
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Digest attribution
-- ---------------------------------------------------------------------------

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
        reviewed_by     = 'auto',
        review_decision = 'confirmed',
        review_note     = 'auto: low-surprise, non-sensitive',
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
        reviewed_by     = 'auto',
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

GRANT EXECUTE ON FUNCTION public.mnemos_run_digest_autoreview_cohort(numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_digest_backlog_drain(boolean, boolean, integer, numeric, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- Softening dry-run proposals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mnemos_softening_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  engram_id uuid NOT NULL REFERENCES public.engrams(id) ON DELETE CASCADE,
  original_content text NOT NULL,
  proposed_content text NOT NULL,
  original_hash text NOT NULL,
  reason text,
  validator_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  source text NOT NULL DEFAULT 'mnemos-soften',
  dry_run boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'proposed',
  accepted_at timestamptz,
  rejected_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mnemos_softening_proposals
  DROP CONSTRAINT IF EXISTS mnemos_softening_proposals_status_check,
  ADD CONSTRAINT mnemos_softening_proposals_status_check
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'applied'));

CREATE INDEX IF NOT EXISTS idx_mnemos_softening_proposals_scope
  ON public.mnemos_softening_proposals (user_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mnemos_softening_proposals_engram
  ON public.mnemos_softening_proposals (engram_id, status);

ALTER TABLE public.mnemos_softening_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own softening proposals" ON public.mnemos_softening_proposals;
CREATE POLICY "Users can view own softening proposals"
  ON public.mnemos_softening_proposals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access softening proposals" ON public.mnemos_softening_proposals;
CREATE POLICY "Service role full access softening proposals"
  ON public.mnemos_softening_proposals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_mnemos_softening_proposals_updated_at ON public.mnemos_softening_proposals;
CREATE TRIGGER update_mnemos_softening_proposals_updated_at
  BEFORE UPDATE ON public.mnemos_softening_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Continuity ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.continuity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  thread_id uuid,
  event_type text NOT NULL,
  subject_type text,
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.continuity_events
  DROP CONSTRAINT IF EXISTS continuity_events_event_type_check,
  ADD CONSTRAINT continuity_events_event_type_check
    CHECK (event_type IN (
      'recall_hit', 'recall_miss', 'reteach_detected',
      'belief_formed', 'belief_revised', 'schema_formed', 'schema_revised',
      'digest_accepted', 'digest_rejected', 'digest_distilled',
      'softening_proposed', 'softening_applied',
      'encode_queued', 'encode_skipped', 'encode_encoded', 'encode_failed'
    ));

CREATE INDEX IF NOT EXISTS idx_continuity_events_scope_time
  ON public.continuity_events (user_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_continuity_events_type_time
  ON public.continuity_events (event_type, created_at DESC);

ALTER TABLE public.continuity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own continuity events" ON public.continuity_events;
CREATE POLICY "Users can view own continuity events"
  ON public.continuity_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access continuity events" ON public.continuity_events;
CREATE POLICY "Service role full access continuity events"
  ON public.continuity_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Health snapshot additions
-- ---------------------------------------------------------------------------

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
  WITH cur(metric, value, adv, backlog, detail) AS (
    SELECT 'engrams_total',           (SELECT count(*) FROM engrams)::numeric, false, NULL::numeric, '{}'::jsonb
    UNION ALL SELECT 'engrams_never_accessed',  (SELECT count(*) FROM engrams WHERE coalesce(access_count,0)=0)::numeric, false, NULL, '{}'::jsonb
    UNION ALL SELECT 'engrams_stability_floor', (SELECT count(*) FROM engrams WHERE coalesce(stability,0)<=0.11)::numeric, false, NULL, '{}'::jsonb
    UNION ALL SELECT 'engrams_dormant',         (SELECT count(*) FROM engrams WHERE state='dormant')::numeric, false, NULL, '{}'::jsonb
    UNION ALL SELECT 'beliefs_active_total',    (SELECT count(*) FROM beliefs WHERE coalesce(active,true))::numeric, false, NULL, '{}'::jsonb
    UNION ALL SELECT 'beliefs_formed_7d',       (SELECT count(*) FROM beliefs WHERE created_at >= v_now - interval '7 days')::numeric, false, NULL, '{}'::jsonb
    UNION ALL SELECT 'beliefs_revised_7d',      (SELECT count(*) FROM beliefs WHERE updated_at >= v_now - interval '7 days' AND updated_at > created_at + interval '1 minute')::numeric, false, NULL, '{}'::jsonb
    UNION ALL SELECT 'beliefs_active_agents',   (SELECT count(DISTINCT agent_id) FROM beliefs WHERE coalesce(active,true))::numeric, false, NULL,
      COALESCE((SELECT jsonb_object_agg(agent_id, n) FROM (
        SELECT agent_id, count(*) AS n FROM beliefs WHERE coalesce(active,true) GROUP BY agent_id
      ) s), '{}'::jsonb)
    UNION ALL SELECT 'hypomnema_graduated',     (SELECT count(*) FROM hypomnema_entry WHERE graduated_to_engram_id IS NOT NULL)::numeric, true,
                                                (SELECT count(*) FROM hypomnema_entry WHERE active AND graduated_to_engram_id IS NULL AND created_at <= v_now - interval '7 days')::numeric, '{}'::jsonb
    UNION ALL SELECT 'curiosity_resolved',      (SELECT count(*) FROM curiosity_questions WHERE status <> 'pending')::numeric, true,
                                                (SELECT count(*) FROM curiosity_questions WHERE status = 'pending')::numeric, '{}'::jsonb
    UNION ALL SELECT 'beliefs_challenged',      (SELECT count(*) FROM beliefs WHERE (CASE WHEN jsonb_typeof(revision_history) = 'array' THEN jsonb_array_length(revision_history) ELSE 0 END)>0)::numeric, true,
                                                (SELECT count(*) FROM beliefs WHERE coalesce(active,true) AND (CASE WHEN jsonb_typeof(revision_history) = 'array' THEN jsonb_array_length(revision_history) ELSE 0 END)=0)::numeric, '{}'::jsonb
    UNION ALL SELECT 'digest_reviewed_total',   (SELECT coalesce(sum(reviewed_count),0) FROM mnemos_digests)::numeric, true,
                                                (SELECT count(*) FROM mnemos_digests WHERE status = 'open')::numeric, '{}'::jsonb
    UNION ALL SELECT 'crisis_followups_done',   (SELECT count(*) FROM crisis_events WHERE followup_completed_at IS NOT NULL)::numeric, false, NULL, '{}'::jsonb
    UNION ALL SELECT 'emotional_history_total', (SELECT count(*) FROM emotional_history)::numeric, false, NULL, '{}'::jsonb
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
           jsonb_build_object('backlog', c.backlog, 'is_advancement', c.adv) || c.detail
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
