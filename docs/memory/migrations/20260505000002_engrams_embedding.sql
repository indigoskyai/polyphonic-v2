-- Vector embeddings + hybrid retrieval
-- Adds embedding column to engrams and hypomnema_entry. Enables semantic recall.
-- See docs/memory/PLAN.md section 3 for full design.

-- Ensure pgvector extension is enabled (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding to engrams
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'openai/text-embedding-3-small';

-- ivfflat index for cosine similarity search on engrams
-- lists = 100 is reasonable for tens of thousands of rows; tune if scale changes
CREATE INDEX IF NOT EXISTS engrams_embedding_cosine_idx
  ON public.engrams USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Add embedding to hypomnema_entry
ALTER TABLE public.hypomnema_entry
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'openai/text-embedding-3-small';

CREATE INDEX IF NOT EXISTS hypomnema_entry_embedding_cosine_idx
  ON public.hypomnema_entry USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- RPC: hybrid match for engrams
-- Returns engrams matching either a text query (trigram) OR a query embedding (cosine).
-- Caller does RRF fusion in application code.
CREATE OR REPLACE FUNCTION public.match_engrams_vector(
  query_embedding vector(1536),
  match_count int DEFAULT 20,
  p_user_id uuid DEFAULT NULL,
  min_strength numeric DEFAULT 0.05
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  content text,
  engram_type text,
  strength numeric,
  stability numeric,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id,
    e.user_id,
    e.content,
    e.engram_type,
    e.strength,
    e.stability,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.engrams e
  WHERE
    e.embedding IS NOT NULL
    AND e.state IN ('active', 'consolidating')
    AND e.strength >= min_strength
    AND (p_user_id IS NULL OR e.user_id = p_user_id)
  ORDER BY e.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

-- RPC: vector match for hypomnema (when used with a query context)
CREATE OR REPLACE FUNCTION public.match_hypomnema_vector(
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT NULL,
  p_agent_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  agent_id text,
  content text,
  density text,
  domain text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    h.id,
    h.user_id,
    h.agent_id,
    h.content,
    h.density,
    h.domain,
    1 - (h.embedding <=> query_embedding) AS similarity
  FROM public.hypomnema_entry h
  WHERE
    h.embedding IS NOT NULL
    AND h.active = TRUE
    AND (p_user_id IS NULL OR h.user_id = p_user_id)
    AND (p_agent_id IS NULL OR h.agent_id = p_agent_id)
  ORDER BY h.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_engrams_vector TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_hypomnema_vector TO authenticated, service_role;

COMMENT ON COLUMN public.engrams.embedding IS
  '1536-dim vector embedding (OpenAI text-embedding-3-small via OpenRouter). NULL during gradual backfill.';

COMMENT ON COLUMN public.hypomnema_entry.embedding IS
  'Same as engrams.embedding. Used for semantic retrieval when hypomnema is queried with a context (rare; usually always-loaded).';
