-- Repair reliable functional memory recall after pg_trgm was moved out of public.
-- The newer 4-argument match_memories RPC was still resolving similarity()
-- against its restricted search_path, which made continuity-inspect report a
-- degraded functional memory layer.

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, service_role, anon;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.match_memories(
  query_text text,
  match_count integer DEFAULT 10,
  p_user_id uuid DEFAULT NULL,
  p_agent_id text DEFAULT 'luca'
)
RETURNS TABLE(
  id uuid,
  content text,
  memory_type text,
  confidence double precision,
  emotional_valence double precision,
  emotional_intensity double precision,
  estimated_date text,
  tags text[],
  provenance jsonb,
  created_at timestamptz,
  similarity real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.memory_type,
    m.confidence,
    m.emotional_valence,
    m.emotional_intensity,
    m.estimated_date,
    m.tags,
    m.provenance,
    m.created_at,
    extensions.similarity(m.content, query_text) AS similarity
  FROM public.memories m
  WHERE
    m.user_id = COALESCE(p_user_id, auth.uid())
    AND m.agent_id = COALESCE(p_agent_id, 'luca')
    AND COALESCE(m.is_deleted, false) = false
    AND extensions.similarity(m.content, query_text) > 0.05
  ORDER BY extensions.similarity(m.content, query_text) DESC
  LIMIT match_count;
END;
$$;

ALTER FUNCTION public.match_memories(text, integer, uuid, text)
  SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.match_memories(text, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_memories(text, integer, uuid, text) TO authenticated, service_role;
