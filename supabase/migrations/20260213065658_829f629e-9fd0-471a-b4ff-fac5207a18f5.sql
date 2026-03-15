
-- Phase 1: Enhance memories table and create supporting tables

-- Add new columns to memories table
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS confidence_source TEXT DEFAULT 'model_inferred',
  ADD COLUMN IF NOT EXISTS overlay_scope TEXT DEFAULT 'relationship',
  ADD COLUMN IF NOT EXISTS provenance JSONB,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS emotional_valence DOUBLE PRECISION DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS verified_by_user BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.memories(id),
  ADD COLUMN IF NOT EXISTS supersedes UUID REFERENCES public.memories(id),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decay_factor DOUBLE PRECISION DEFAULT 1.0;

-- Create indexes for memory queries
CREATE INDEX IF NOT EXISTS idx_memories_active ON public.memories(user_id, is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON public.memories(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_memories_type ON public.memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON public.memories USING GIN(tags);

-- Memory connections (knowledge graph)
CREATE TABLE IF NOT EXISTS public.memory_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  target_memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL, -- supports, contradicts, elaborates, causes, temporal
  strength DOUBLE PRECISION DEFAULT 0.5,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_memory_id, target_memory_id, relation_type)
);

ALTER TABLE public.memory_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections" ON public.memory_connections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own connections" ON public.memory_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own connections" ON public.memory_connections
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all connections" ON public.memory_connections
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Curiosity questions
CREATE TABLE IF NOT EXISTS public.curiosity_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  context TEXT,
  curiosity_score DOUBLE PRECISION DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, shown, answered, dismissed
  source_conversation_id UUID REFERENCES public.conversations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shown_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ
);

ALTER TABLE public.curiosity_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own questions" ON public.curiosity_questions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own questions" ON public.curiosity_questions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own questions" ON public.curiosity_questions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all questions" ON public.curiosity_questions
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_curiosity_pending ON public.curiosity_questions(user_id, status) WHERE status = 'pending';

-- Reflection jobs
CREATE TABLE IF NOT EXISTS public.reflection_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  job_type TEXT NOT NULL DEFAULT 'extract', -- extract, reflect, compress
  memories_created INTEGER DEFAULT 0,
  memories_updated INTEGER DEFAULT 0,
  questions_generated INTEGER DEFAULT 0,
  conflicts_detected INTEGER DEFAULT 0,
  connections_created INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reflection_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON public.reflection_jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.reflection_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON public.reflection_jobs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all jobs" ON public.reflection_jobs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Memory conflicts
CREATE TABLE IF NOT EXISTS public.memory_conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  memory_a_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  memory_b_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL DEFAULT 'contradiction', -- contradiction, update, ambiguity
  status TEXT NOT NULL DEFAULT 'unresolved', -- unresolved, resolved, ignored
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conflicts" ON public.memory_conflicts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own conflicts" ON public.memory_conflicts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conflicts" ON public.memory_conflicts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all conflicts" ON public.memory_conflicts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON public.memory_conflicts(user_id, status) WHERE status = 'unresolved';
