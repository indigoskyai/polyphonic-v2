
CREATE OR REPLACE FUNCTION public.update_memory_decay()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rows_affected integer;
BEGIN
  -- Main decay update: apply exponential decay with access reinforcement and verified floor
  UPDATE memories m
  SET decay_factor = GREATEST(
    EXP(
      -(CASE m.memory_type
        WHEN 'fact' THEN 0.001
        WHEN 'preference' THEN 0.003
        WHEN 'relationship' THEN 0.002
        WHEN 'principle' THEN 0.001
        WHEN 'commitment' THEN 0.02
        WHEN 'moment' THEN 0.0005
        WHEN 'skill' THEN 0.003
        WHEN 'goal' THEN 0.008
        WHEN 'context' THEN 0.01
        WHEN 'synthesis' THEN 0.002
        ELSE 0.005
      END)
      * EXTRACT(EPOCH FROM (NOW() - m.created_at)) / 86400.0
    )
    + LEAST(COALESCE(m.access_count, 0) * 0.02, 0.3),
    CASE WHEN COALESCE(m.verified_by_user, false) THEN 0.5 ELSE 0.0 END
  ),
  updated_at = NOW()
  WHERE COALESCE(m.is_deleted, false) = false
    AND m.memory_type IN (
      'fact', 'preference', 'relationship', 'principle',
      'commitment', 'moment', 'skill', 'goal', 'context', 'synthesis'
    );

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  -- Auto-dormant: force expired commitments to 0.1
  UPDATE memories
  SET decay_factor = 0.1,
      updated_at = NOW()
  WHERE memory_type = 'commitment'
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
    AND decay_factor > 0.1
    AND COALESCE(is_deleted, false) = false;

  RETURN rows_affected;
END;
$$;
