
CREATE OR REPLACE FUNCTION match_engrams(
  query_text TEXT,
  match_count INT DEFAULT 20,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  engram_type TEXT,
  strength FLOAT,
  stability FLOAT,
  accessibility FLOAT,
  emotional_valence FLOAT,
  emotional_arousal FLOAT,
  surprise_score FLOAT,
  source_context JSONB,
  tags TEXT[],
  state TEXT,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.user_id, e.content, e.engram_type,
    e.strength, e.stability, e.accessibility,
    e.emotional_valence, e.emotional_arousal, e.surprise_score,
    e.source_context, e.tags, e.state,
    e.last_accessed_at, e.access_count, e.created_at, e.updated_at,
    similarity(e.content, query_text)::FLOAT AS similarity
  FROM public.engrams e
  WHERE
    e.user_id = COALESCE(p_user_id, auth.uid())
    AND e.state IN ('active', 'consolidating')
    AND similarity(e.content, query_text) > 0.05
  ORDER BY similarity(e.content, query_text) DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
