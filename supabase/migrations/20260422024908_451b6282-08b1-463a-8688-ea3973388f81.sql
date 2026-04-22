-- Phase A: Index for fast cascade deletes by import_id
CREATE INDEX IF NOT EXISTS idx_memories_provenance_import_id 
ON public.memories ((provenance->>'import_id'));

-- Phase C: Profile chat tables
CREATE TABLE IF NOT EXISTS public.profile_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  profile_version INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.profile_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_chats_user ON public.profile_chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_chat_messages_chat ON public.profile_chat_messages(chat_id, created_at);

ALTER TABLE public.profile_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own profile chats" ON public.profile_chats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access profile_chats" ON public.profile_chats
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users access own profile chat messages" ON public.profile_chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access profile_chat_messages" ON public.profile_chat_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER update_profile_chats_updated_at
  BEFORE UPDATE ON public.profile_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigram search function for memories (parallels match_engrams)
CREATE OR REPLACE FUNCTION public.match_memories(
  query_text TEXT,
  match_count INTEGER DEFAULT 10,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  content TEXT,
  memory_type TEXT,
  confidence DOUBLE PRECISION,
  emotional_valence DOUBLE PRECISION,
  emotional_intensity DOUBLE PRECISION,
  estimated_date TEXT,
  tags TEXT[],
  provenance JSONB,
  created_at TIMESTAMPTZ,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.content, m.memory_type, m.confidence,
    m.emotional_valence, m.emotional_intensity, m.estimated_date,
    m.tags, m.provenance, m.created_at,
    similarity(m.content, query_text) AS similarity
  FROM public.memories m
  WHERE
    m.user_id = COALESCE(p_user_id, auth.uid())
    AND COALESCE(m.is_deleted, false) = false
    AND similarity(m.content, query_text) > 0.05
  ORDER BY similarity(m.content, query_text) DESC
  LIMIT match_count;
END;
$$;