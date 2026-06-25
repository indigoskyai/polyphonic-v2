
CREATE OR REPLACE FUNCTION public.cognitive_memory_stats(p_user_id uuid, p_agent_id text)
RETURNS TABLE(
  total_engrams bigint,
  active bigint,
  dormant bigint,
  archived bigint,
  connections bigint,
  beliefs_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM engrams WHERE user_id = p_user_id AND agent_id = p_agent_id),
    (SELECT count(*) FROM engrams WHERE user_id = p_user_id AND agent_id = p_agent_id AND state = 'active'),
    (SELECT count(*) FROM engrams WHERE user_id = p_user_id AND agent_id = p_agent_id AND state = 'dormant'),
    (SELECT count(*) FROM engram_archive WHERE user_id = p_user_id AND agent_id = p_agent_id),
    (SELECT count(*) FROM connections WHERE user_id = p_user_id AND agent_id = p_agent_id),
    (SELECT count(*) FROM beliefs WHERE user_id = p_user_id AND agent_id = p_agent_id);
$$;

GRANT EXECUTE ON FUNCTION public.cognitive_memory_stats(uuid, text) TO authenticated, service_role;
