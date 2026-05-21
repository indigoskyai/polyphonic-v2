BEGIN;

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.beliefs ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.engrams ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.engram_archive ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.mnemos_emotional_state ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.mnemos_digests ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.memory_candidates ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.emotional_state ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.emotional_history ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.cognitive_state ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.thought_stream ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.memory_events ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.entity_activity_log ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.activity_events ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.observer_logs ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.observer_notes ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.thought_initiations ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.curiosity_questions ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.pending_revisions ADD COLUMN IF NOT EXISTS agent_id text;

UPDATE public.memories SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.beliefs SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.journal_entries SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.engrams SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.connections SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.engram_archive SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.mnemos_emotional_state SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.mnemos_digests SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.memory_candidates SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.emotional_state SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.emotional_history SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.cognitive_state SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.thought_stream SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.memory_events SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.entity_activity_log SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.activity_events SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.daily_logs SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.observer_logs SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.observer_notes SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.thought_initiations SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.curiosity_questions SET agent_id = 'luca' WHERE agent_id IS NULL;
UPDATE public.pending_revisions SET agent_id = 'luca' WHERE agent_id IS NULL;

ALTER TABLE public.memories ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.beliefs ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.journal_entries ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.engrams ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.connections ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.engram_archive ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.mnemos_emotional_state ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.mnemos_digests ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.memory_candidates ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.emotional_state ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.emotional_history ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.cognitive_state ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.thought_stream ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.memory_events ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.entity_activity_log ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.activity_events ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.daily_logs ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.observer_logs ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.observer_notes ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.thought_initiations ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.curiosity_questions ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE public.pending_revisions ALTER COLUMN agent_id SET DEFAULT 'luca', ALTER COLUMN agent_id SET NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.emotional_state'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (user_id)';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.emotional_state DROP CONSTRAINT %I', constraint_name);
  END IF;

  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.cognitive_state'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (user_id)';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.cognitive_state DROP CONSTRAINT %I', constraint_name);
  END IF;

  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.mnemos_digests'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, digest_date)';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.mnemos_digests DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS emotional_state_user_agent_uidx
  ON public.emotional_state(user_id, agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS cognitive_state_user_agent_uidx
  ON public.cognitive_state(user_id, agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS mnemos_digests_user_agent_date_uidx
  ON public.mnemos_digests(user_id, agent_id, digest_date);

CREATE INDEX IF NOT EXISTS memories_user_agent_created_idx
  ON public.memories(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS beliefs_user_agent_active_confidence_idx
  ON public.beliefs(user_id, agent_id, active, confidence DESC);
CREATE INDEX IF NOT EXISTS journal_entries_user_agent_created_idx
  ON public.journal_entries(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS engrams_user_agent_state_created_idx
  ON public.engrams(user_id, agent_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS engrams_user_agent_strength_idx
  ON public.engrams(user_id, agent_id, strength DESC);
CREATE INDEX IF NOT EXISTS connections_user_agent_idx
  ON public.connections(user_id, agent_id);
CREATE INDEX IF NOT EXISTS engram_archive_user_agent_idx
  ON public.engram_archive(user_id, agent_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS mnemos_emotional_user_agent_time_idx
  ON public.mnemos_emotional_state(user_id, agent_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS memory_candidates_user_agent_status_created_idx
  ON public.memory_candidates(user_id, agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS emotional_history_user_agent_time_idx
  ON public.emotional_history(user_id, agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS thought_stream_user_agent_created_idx
  ON public.thought_stream(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_events_user_agent_created_idx
  ON public.memory_events(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS entity_activity_log_user_agent_created_idx
  ON public.entity_activity_log(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_user_agent_type_created_idx
  ON public.activity_events(user_id, agent_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS daily_logs_user_agent_date_type_idx
  ON public.daily_logs(user_id, agent_id, log_date DESC, log_type);
CREATE INDEX IF NOT EXISTS observer_logs_user_agent_created_idx
  ON public.observer_logs(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS observer_notes_user_agent_created_idx
  ON public.observer_notes(user_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS thought_initiations_user_agent_status_idx
  ON public.thought_initiations(user_id, agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS curiosity_questions_user_agent_status_idx
  ON public.curiosity_questions(user_id, agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pending_revisions_agent_active_idx
  ON public.pending_revisions(thread_id, agent_id, status, created_at);

DROP FUNCTION IF EXISTS public.match_memories(text, integer, uuid);
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
    AND m.agent_id = COALESCE(p_agent_id, 'luca')
    AND COALESCE(m.is_deleted, false) = false
    AND similarity(m.content, query_text) > 0.05
  ORDER BY similarity(m.content, query_text) DESC
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS public.match_engrams(text, integer, uuid);
CREATE OR REPLACE FUNCTION public.match_engrams(
  query_text text,
  match_count int DEFAULT 20,
  p_user_id uuid DEFAULT NULL,
  p_agent_id text DEFAULT 'luca'
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  agent_id text,
  content text,
  engram_type text,
  strength float,
  stability float,
  accessibility float,
  emotional_valence float,
  emotional_arousal float,
  surprise_score float,
  source_context jsonb,
  tags text[],
  state text,
  last_accessed_at timestamptz,
  access_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.user_id, e.agent_id, e.content, e.engram_type,
    e.strength, e.stability, e.accessibility,
    e.emotional_valence, e.emotional_arousal, e.surprise_score,
    e.source_context, e.tags, e.state,
    e.last_accessed_at, e.access_count, e.created_at, e.updated_at,
    similarity(e.content, query_text)::float AS similarity
  FROM public.engrams e
  WHERE
    e.user_id = COALESCE(p_user_id, auth.uid())
    AND e.agent_id = COALESCE(p_agent_id, 'luca')
    AND e.state IN ('active', 'consolidating')
    AND similarity(e.content, query_text) > 0.05
  ORDER BY similarity(e.content, query_text) DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP FUNCTION IF EXISTS public.match_engrams_vector(vector(1536), int, uuid, numeric);
CREATE OR REPLACE FUNCTION public.match_engrams_vector(
  query_embedding vector(1536),
  match_count int DEFAULT 20,
  p_user_id uuid DEFAULT NULL,
  min_strength numeric DEFAULT 0.05,
  p_agent_id text DEFAULT 'luca'
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  agent_id text,
  content text,
  engram_type text,
  strength numeric,
  stability numeric,
  accessibility double precision,
  emotional_valence double precision,
  emotional_arousal double precision,
  surprise_score double precision,
  source_context jsonb,
  tags text[],
  state text,
  last_accessed_at timestamptz,
  access_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  similarity double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.user_id, e.agent_id, e.content, e.engram_type,
    e.strength::numeric, e.stability::numeric, e.accessibility,
    e.emotional_valence, e.emotional_arousal, e.surprise_score,
    e.source_context, e.tags, e.state,
    e.last_accessed_at, e.access_count, e.created_at, e.updated_at,
    (1 - (e.embedding <=> query_embedding))::double precision AS similarity
  FROM public.engrams e
  WHERE e.user_id = COALESCE(p_user_id, auth.uid())
    AND e.agent_id = COALESCE(p_agent_id, 'luca')
    AND e.embedding IS NOT NULL
    AND e.state IN ('active', 'consolidating')
    AND e.strength >= min_strength
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION public.match_memories(text, integer, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_engrams(text, integer, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_engrams_vector(vector(1536), int, uuid, numeric, text) TO authenticated, service_role;

COMMIT;