
-- Enable pg_trgm extension for trigram similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. beliefs table (must exist before engrams migration references it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beliefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5,
  domain TEXT,
  evidence JSONB DEFAULT '[]',
  revision_history JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  last_revised TIMESTAMPTZ,
  last_challenged TIMESTAMPTZ,
  stagnant BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  superseded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  supporting_engram_ids UUID[] DEFAULT '{}',
  contradicting_engram_ids UUID[] DEFAULT '{}'
);

-- Generated confidence_tier column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beliefs' AND column_name = 'confidence_tier'
  ) THEN
    ALTER TABLE public.beliefs ADD COLUMN confidence_tier TEXT GENERATED ALWAYS AS (
      CASE
        WHEN confidence >= 0.9 THEN 'conviction'
        WHEN confidence >= 0.7 THEN 'strong'
        WHEN confidence >= 0.5 THEN 'moderate'
        WHEN confidence >= 0.3 THEN 'tentative'
        ELSE 'uncertain'
      END
    ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_beliefs_user ON public.beliefs(user_id);
CREATE INDEX IF NOT EXISTS idx_beliefs_confidence_tier ON public.beliefs(user_id, confidence_tier);

ALTER TABLE public.beliefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own beliefs" ON public.beliefs
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access beliefs" ON public.beliefs
  FOR ALL USING (current_setting('role') = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. engrams — core memory units with dual-trace encoding
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  engram_type TEXT NOT NULL CHECK (engram_type IN ('episodic', 'semantic', 'procedural', 'belief')),
  strength FLOAT NOT NULL DEFAULT 1.0,
  stability FLOAT NOT NULL DEFAULT 0.0,
  accessibility FLOAT NOT NULL DEFAULT 1.0,
  emotional_valence FLOAT DEFAULT 0.0,
  emotional_arousal FLOAT DEFAULT 0.0,
  surprise_score FLOAT DEFAULT 0.0,
  source_context JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'consolidating', 'dormant', 'archived')),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engrams_user ON public.engrams(user_id);
CREATE INDEX IF NOT EXISTS idx_engrams_state ON public.engrams(user_id, state);
CREATE INDEX IF NOT EXISTS idx_engrams_type ON public.engrams(user_id, engram_type);
CREATE INDEX IF NOT EXISTS idx_engrams_strength ON public.engrams(user_id, strength DESC);
CREATE INDEX IF NOT EXISTS idx_engrams_tags ON public.engrams USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_engrams_content_trgm ON public.engrams USING gin(content gin_trgm_ops);

ALTER TABLE public.engrams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own engrams" ON public.engrams
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access engrams" ON public.engrams
  FOR ALL USING (current_setting('role') = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. connections — typed edges between engrams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.engrams(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.engrams(id) ON DELETE CASCADE,
  connection_type TEXT NOT NULL CHECK (connection_type IN (
    'supports', 'contradicts', 'causes', 'extends', 'parallels', 'synthesizes', 'grounds'
  )),
  weight FLOAT NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_connections_source ON public.connections(source_id);
CREATE INDEX IF NOT EXISTS idx_connections_target ON public.connections(target_id);
CREATE INDEX IF NOT EXISTS idx_connections_user ON public.connections(user_id);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own connections" ON public.connections
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access connections" ON public.connections
  FOR ALL USING (current_setting('role') = 'service_role');

-- ---------------------------------------------------------------------------
-- 4. engram_archive — cold storage for decayed engrams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engram_archive (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  engram_type TEXT NOT NULL,
  original_strength FLOAT,
  original_stability FLOAT,
  tags TEXT[] DEFAULT '{}',
  source_context JSONB DEFAULT '{}',
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  original_created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_engram_archive_user ON public.engram_archive(user_id);

ALTER TABLE public.engram_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own archived engrams" ON public.engram_archive
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access engram_archive" ON public.engram_archive
  FOR ALL USING (current_setting('role') = 'service_role');

-- ---------------------------------------------------------------------------
-- 5. mnemos_emotional_state — 6-axis emotional time series
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mnemos_emotional_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valence FLOAT DEFAULT 0.0,
  arousal FLOAT DEFAULT 0.0,
  dominance FLOAT DEFAULT 0.0,
  certainty FLOAT DEFAULT 0.5,
  social FLOAT DEFAULT 0.0,
  temporal FLOAT DEFAULT 0.0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mnemos_emotional_user ON public.mnemos_emotional_state(user_id);
CREATE INDEX IF NOT EXISTS idx_mnemos_emotional_time ON public.mnemos_emotional_state(user_id, recorded_at DESC);

ALTER TABLE public.mnemos_emotional_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own mnemos emotional state" ON public.mnemos_emotional_state
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access mnemos_emotional_state" ON public.mnemos_emotional_state
  FOR ALL USING (current_setting('role') = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. updated_at trigger for engrams
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'engrams_updated_at') THEN
    CREATE TRIGGER engrams_updated_at
      BEFORE UPDATE ON public.engrams
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. match_engrams RPC — trigram-based similarity search
-- ---------------------------------------------------------------------------
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 8. Add new columns to user_settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS multi_model_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ensemble_models JSONB DEFAULT '["anthropic/claude-sonnet-4-20250514", "openai/gpt-4o", "google/gemini-2.5-pro-preview-03-25"]'::jsonb,
  ADD COLUMN IF NOT EXISTS synthesis_model TEXT DEFAULT 'anthropic/claude-sonnet-4-20250514';
