
-- Create memories table (referenced by import-chatgpt and memory-synthesize edge functions)
CREATE TABLE public.memories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  content text NOT NULL,
  memory_type text NOT NULL DEFAULT 'fact',
  relevance_score double precision NOT NULL DEFAULT 0.5,
  confidence double precision NOT NULL DEFAULT 0.5,
  confidence_source text DEFAULT 'model_inferred',
  emotional_valence double precision DEFAULT 0.0,
  emotional_intensity double precision DEFAULT 0.0,
  detail_level text DEFAULT 'standard',
  narrative_thread text,
  tags text[] DEFAULT '{}'::text[],
  summary text,
  staleness_risk text DEFAULT 'low',
  estimated_date text,
  needs_confirmation boolean DEFAULT false,
  provenance jsonb DEFAULT '{}'::jsonb,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own memories" ON public.memories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access memories" ON public.memories FOR ALL USING (auth.role() = 'service_role'::text);

CREATE INDEX idx_memories_user_id ON public.memories(user_id);
CREATE INDEX idx_memories_type ON public.memories(user_id, memory_type);
CREATE INDEX idx_memories_not_deleted ON public.memories(user_id) WHERE is_deleted = false;

CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON public.memories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create chat_imports table
CREATE TABLE public.chat_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  pipeline_stage text DEFAULT 'uploading',
  source_platform text DEFAULT 'chatgpt',
  total_conversations integer DEFAULT 0,
  processed_conversations integer DEFAULT 0,
  memories_created integer DEFAULT 0,
  questions_generated integer DEFAULT 0,
  conflicts_detected integer DEFAULT 0,
  file_size_bytes bigint DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

ALTER TABLE public.chat_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own imports" ON public.chat_imports FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access chat_imports" ON public.chat_imports FOR ALL USING (auth.role() = 'service_role'::text);

-- Create psychological_profile table
CREATE TABLE public.psychological_profile (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  identity_narrative text,
  personality_dimensions jsonb DEFAULT '{}'::jsonb,
  communication_patterns jsonb DEFAULT '{}'::jsonb,
  emotional_landscape jsonb DEFAULT '{}'::jsonb,
  values_hierarchy jsonb DEFAULT '{}'::jsonb,
  relational_dynamics jsonb DEFAULT '{}'::jsonb,
  cognitive_tendencies jsonb DEFAULT '{}'::jsonb,
  growth_edges jsonb DEFAULT '{}'::jsonb,
  shadow_patterns jsonb DEFAULT '{}'::jsonb,
  raw_analysis jsonb DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.psychological_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own profile data" ON public.psychological_profile FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access psychological_profile" ON public.psychological_profile FOR ALL USING (auth.role() = 'service_role'::text);

CREATE TRIGGER update_psychological_profile_updated_at BEFORE UPDATE ON public.psychological_profile FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create curiosity_questions table
CREATE TABLE public.curiosity_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  question text NOT NULL,
  context text,
  curiosity_score double precision DEFAULT 0.5,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone
);

ALTER TABLE public.curiosity_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own curiosity questions" ON public.curiosity_questions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access curiosity_questions" ON public.curiosity_questions FOR ALL USING (auth.role() = 'service_role'::text);
