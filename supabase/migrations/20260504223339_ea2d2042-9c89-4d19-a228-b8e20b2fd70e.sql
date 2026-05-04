-- ============================================================
-- 20260505000001_hypomnema_entry.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hypomnema_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL DEFAULT 'luca',
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  density TEXT NOT NULL DEFAULT 'primary' CHECK (density IN ('primary', 'observer')),
  primary_in_thread BOOLEAN NOT NULL DEFAULT TRUE,
  domain TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_revised TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_challenged TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision_count INT NOT NULL DEFAULT 0,
  revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by UUID REFERENCES public.hypomnema_entry(id) ON DELETE SET NULL,
  foundational BOOLEAN NOT NULL DEFAULT FALSE,
  active_attention BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'reflection' CHECK (source IN ('reflection', 'observer', 'belief_challenge', 'onboarding')),
  graduated_to_engram_id UUID REFERENCES public.engrams(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hypomnema_entry_active_idx
  ON public.hypomnema_entry(agent_id, user_id, active, last_revised DESC);
CREATE INDEX IF NOT EXISTS hypomnema_entry_thread_idx
  ON public.hypomnema_entry(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hypomnema_entry_challenge_idx
  ON public.hypomnema_entry(last_challenged ASC) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS hypomnema_entry_graduation_idx
  ON public.hypomnema_entry(user_id, agent_id, revision_count DESC, last_revised DESC)
  WHERE active = TRUE AND graduated_to_engram_id IS NULL;
CREATE INDEX IF NOT EXISTS hypomnema_entry_tags_idx
  ON public.hypomnema_entry USING GIN(tags);

DROP TRIGGER IF EXISTS hypomnema_entry_touch ON public.hypomnema_entry;
CREATE TRIGGER hypomnema_entry_touch
  BEFORE UPDATE ON public.hypomnema_entry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.hypomnema_entry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_hypomnema" ON public.hypomnema_entry;
CREATE POLICY "users_select_own_hypomnema" ON public.hypomnema_entry FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users_insert_own_hypomnema" ON public.hypomnema_entry;
CREATE POLICY "users_insert_own_hypomnema" ON public.hypomnema_entry FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users_update_own_hypomnema" ON public.hypomnema_entry;
CREATE POLICY "users_update_own_hypomnema" ON public.hypomnema_entry FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users_delete_own_hypomnema" ON public.hypomnema_entry;
CREATE POLICY "users_delete_own_hypomnema" ON public.hypomnema_entry FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hypomnema_entry;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE public.hypomnema_entry IS 'Per-agent, per-user first-person interior-state entries. The "felt continuity" layer between Mnemos substrate and active conversation. Always-loaded into system prompt assembly.';
COMMENT ON COLUMN public.hypomnema_entry.density IS 'primary: full first-person reflection by the agent who was primary in the source thread. observer: shorter peripheral note by an agent who participated but was not primary.';
COMMENT ON COLUMN public.hypomnema_entry.foundational IS 'When TRUE, entry is immune to deep decay (salience floor 0.7).';
COMMENT ON COLUMN public.hypomnema_entry.graduated_to_engram_id IS 'Set by mnemos-graduate cron when the entry is promoted to a Mnemos engram.';

-- ============================================================
-- 20260505000002_engrams_embedding.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'openai/text-embedding-3-small';

CREATE INDEX IF NOT EXISTS engrams_embedding_cosine_idx
  ON public.engrams USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.hypomnema_entry
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'openai/text-embedding-3-small';

CREATE INDEX IF NOT EXISTS hypomnema_entry_embedding_cosine_idx
  ON public.hypomnema_entry USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE OR REPLACE FUNCTION public.match_engrams_vector(
  query_embedding vector(1536),
  match_count int DEFAULT 20,
  p_user_id uuid DEFAULT NULL,
  min_strength numeric DEFAULT 0.05
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, engram_type text,
  strength numeric, stability numeric, similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.user_id, e.content, e.engram_type,
    e.strength::numeric, e.stability::numeric,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.engrams e
  WHERE e.embedding IS NOT NULL
    AND e.state IN ('active', 'consolidating')
    AND e.strength >= min_strength
    AND (p_user_id IS NULL OR e.user_id = p_user_id)
  ORDER BY e.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_hypomnema_vector(
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT NULL,
  p_agent_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, user_id uuid, agent_id text, content text,
  density text, domain text, similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, h.user_id, h.agent_id, h.content, h.density, h.domain,
    1 - (h.embedding <=> query_embedding) AS similarity
  FROM public.hypomnema_entry h
  WHERE h.embedding IS NOT NULL
    AND h.active = TRUE
    AND (p_user_id IS NULL OR h.user_id = p_user_id)
    AND (p_agent_id IS NULL OR h.agent_id = p_agent_id)
  ORDER BY h.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_engrams_vector TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_hypomnema_vector TO authenticated, service_role;

COMMENT ON COLUMN public.engrams.embedding IS '1536-dim vector embedding (OpenAI text-embedding-3-small via OpenRouter). NULL during gradual backfill.';
COMMENT ON COLUMN public.hypomnema_entry.embedding IS 'Same as engrams.embedding. Used for semantic retrieval when hypomnema is queried with a context.';

-- ============================================================
-- 20260505000003_threads_agent_metadata.sql
-- ============================================================
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS primary_agent_id TEXT NOT NULL DEFAULT 'luca',
  ADD COLUMN IF NOT EXISTS participating_agent_ids TEXT[] NOT NULL DEFAULT ARRAY['luca'];

CREATE INDEX IF NOT EXISTS threads_primary_agent_idx
  ON public.threads(user_id, primary_agent_id, updated_at DESC);

UPDATE public.threads t
SET participating_agent_ids = subq.agents
FROM (
  SELECT thread_id, ARRAY_AGG(DISTINCT COALESCE(agent, 'luca')) AS agents
  FROM public.messages
  WHERE role = 'assistant'
  GROUP BY thread_id
) subq
WHERE t.id = subq.thread_id;

COMMENT ON COLUMN public.threads.primary_agent_id IS 'The agent the user is primarily in conversation with in this thread.';
COMMENT ON COLUMN public.threads.participating_agent_ids IS 'All agents that have participated in this thread.';

-- ============================================================
-- 20260505000004_pg_cron_hypomnema.sql
-- ============================================================
SELECT cron.unschedule('hypomnema-decay') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='hypomnema-decay');
SELECT cron.unschedule('hypomnema-challenge') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='hypomnema-challenge');
SELECT cron.unschedule('mnemos-graduate') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='mnemos-graduate');

SELECT cron.schedule('hypomnema-decay', '45 */6 * * *',
  $$SELECT public.invoke_edge_function('hypomnema-decay', '{}'::jsonb)$$);
SELECT cron.schedule('hypomnema-challenge', '0 4 * * *',
  $$SELECT public.invoke_edge_function('hypomnema-challenge', '{}'::jsonb)$$);
SELECT cron.schedule('mnemos-graduate', '15 4 * * *',
  $$SELECT public.invoke_edge_function('mnemos-graduate', '{}'::jsonb)$$);