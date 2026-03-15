
CREATE OR REPLACE FUNCTION public.update_memory_decay()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE memories
  SET decay_factor = LEAST(
    CASE
      WHEN verified_by_user = true THEN
        GREATEST(
          decay_factor * exp(
            -1.0 * (
              CASE memory_type
                WHEN 'fact' THEN 0.001
                WHEN 'preference' THEN 0.005
                WHEN 'opinion' THEN 0.007
                WHEN 'goal' THEN 0.01
                WHEN 'emotion' THEN 0.015
                WHEN 'commitment' THEN 0.02
                WHEN 'routine' THEN 0.003
                WHEN 'relationship' THEN 0.002
                WHEN 'context' THEN 0.012
                WHEN 'synthesis' THEN 0.004
                ELSE 0.005
              END
            )
          ) + LEAST(COALESCE(access_count, 0) * 0.02, 0.3),
          0.5
        )
      ELSE
        decay_factor * exp(
          -1.0 * (
            CASE memory_type
              WHEN 'fact' THEN 0.001
              WHEN 'preference' THEN 0.005
              WHEN 'opinion' THEN 0.007
              WHEN 'goal' THEN 0.01
              WHEN 'emotion' THEN 0.015
              WHEN 'commitment' THEN 0.02
              WHEN 'routine' THEN 0.003
              WHEN 'relationship' THEN 0.002
              WHEN 'context' THEN 0.012
              WHEN 'synthesis' THEN 0.004
              ELSE 0.005
            END
          )
        ) + LEAST(COALESCE(access_count, 0) * 0.02, 0.3)
    END,
    1.0
  ),
  updated_at = now()
  WHERE is_deleted = false;

  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Force expired commitments to 0.1
  UPDATE memories
  SET decay_factor = 0.1, updated_at = now()
  WHERE memory_type = 'commitment'
    AND expires_at IS NOT NULL
    AND expires_at < now()
    AND is_deleted = false
    AND decay_factor > 0.1;

  RETURN affected;
END;
$$;
