-- Keep stale memory-candidate auto-commit scoped to the originating agent.
-- The original Luca-era function inserted memories without agent_id, which
-- defaults custom-agent candidates into Luca's memory bucket.
CREATE OR REPLACE FUNCTION public.auto_commit_stale_memory_candidates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_candidate record;
BEGIN
  FOR v_candidate IN
    SELECT id, user_id, agent_id, content, memory_type, confidence, source
    FROM public.memory_candidates
    WHERE status = 'pending'
      AND created_at < (now() - interval '48 hours')
      AND COALESCE(source->>'source', '') <> 'mnemos_consolidation'
    LIMIT 200
  LOOP
    INSERT INTO public.memories (
      user_id, agent_id, content, memory_type, confidence, provenance
    ) VALUES (
      v_candidate.user_id,
      COALESCE(v_candidate.agent_id, 'luca'),
      v_candidate.content,
      v_candidate.memory_type,
      LEAST(GREATEST(v_candidate.confidence * 0.7, 0), 1),
      COALESCE(v_candidate.source, '{}'::jsonb) || jsonb_build_object('auto_committed', true, 'candidate_id', v_candidate.id)
    );

    UPDATE public.memory_candidates
    SET status = 'committed', reviewed_at = now()
    WHERE id = v_candidate.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
