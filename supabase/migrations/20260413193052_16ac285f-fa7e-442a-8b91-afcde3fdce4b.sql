
-- ============================================
-- STEP 1: Drop old tables (order matters for FKs)
-- ============================================

-- Tables with FK dependencies first
DROP TABLE IF EXISTS message_variants CASCADE;
DROP TABLE IF EXISTS memory_connections CASCADE;
DROP TABLE IF EXISTS memory_conflicts CASCADE;
DROP TABLE IF EXISTS extraction_rejections CASCADE;
DROP TABLE IF EXISTS curiosity_questions CASCADE;
DROP TABLE IF EXISTS reflection_jobs CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- Independent tables
DROP TABLE IF EXISTS activity_events CASCADE;
DROP TABLE IF EXISTS beliefs CASCADE;
DROP TABLE IF EXISTS chat_imports CASCADE;
DROP TABLE IF EXISTS companion_profiles CASCADE;
DROP TABLE IF EXISTS daily_logs CASCADE;
DROP TABLE IF EXISTS emotional_history CASCADE;
DROP TABLE IF EXISTS emotional_state CASCADE;
DROP TABLE IF EXISTS entity_activity_log CASCADE;
DROP TABLE IF EXISTS entity_social_accounts CASCADE;
DROP TABLE IF EXISTS entity_task_queue CASCADE;
DROP TABLE IF EXISTS experimental_persona_config CASCADE;
DROP TABLE IF EXISTS memories CASCADE;
DROP TABLE IF EXISTS model_configs CASCADE;
DROP TABLE IF EXISTS observer_logs CASCADE;
DROP TABLE IF EXISTS system_prompts CASCADE;
DROP TABLE IF EXISTS thought_initiations CASCADE;
DROP TABLE IF EXISTS thought_stream CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS user_skills CASCADE;

-- Drop old functions that reference dropped tables
DROP FUNCTION IF EXISTS public.update_conversation_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.increment_memory_access(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.update_memory_decay() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_emotional_resonance() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_resonance() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_activity_events() CASCADE;
DROP FUNCTION IF EXISTS public.validate_memory_tier() CASCADE;

-- ============================================
-- STEP 2: Create new tables
-- ============================================

-- THREADS
CREATE TABLE public.threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT DEFAULT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  heat TEXT NOT NULL DEFAULT 'warm',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own threads" ON public.threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own threads" ON public.threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own threads" ON public.threads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own threads" ON public.threads FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access threads" ON public.threads FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER update_threads_updated_at BEFORE UPDATE ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- MESSAGES
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT DEFAULT NULL,
  agent TEXT DEFAULT NULL,
  thinking_content TEXT DEFAULT NULL,
  tokens_used INTEGER DEFAULT NULL,
  bookmarked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own messages" ON public.messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access messages" ON public.messages FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- AGENT_CONFIG
CREATE TABLE public.agent_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_name TEXT NOT NULL DEFAULT 'luca',
  voice TEXT DEFAULT NULL,
  system_prompt TEXT DEFAULT NULL,
  default_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4',
  personality JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, agent_name)
);
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent config" ON public.agent_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own agent config" ON public.agent_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agent config" ON public.agent_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agent config" ON public.agent_config FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access agent_config" ON public.agent_config FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER update_agent_config_updated_at BEFORE UPDATE ON public.agent_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- COGNITIVE_STATE
CREATE TABLE public.cognitive_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  modulators JSONB NOT NULL DEFAULT '{"curiosity": 0.5, "focus": 0.5, "confidence": 0.5, "empathy": 0.5, "creativity": 0.5}',
  emotions JSONB NOT NULL DEFAULT '{"valence": 0, "arousal": 0.3, "dominance": 0.5}',
  beliefs JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.cognitive_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cognitive state" ON public.cognitive_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own cognitive state" ON public.cognitive_state FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cognitive state" ON public.cognitive_state FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access cognitive_state" ON public.cognitive_state FOR ALL USING (auth.role() = 'service_role');

-- THOUGHT_STREAM (new version)
CREATE TABLE public.thought_stream (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'reflection',
  content TEXT NOT NULL,
  trigger TEXT DEFAULT NULL,
  salience REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'autonomous',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.thought_stream ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own thoughts" ON public.thought_stream FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own thoughts" ON public.thought_stream FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access thought_stream" ON public.thought_stream FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_thought_stream_user_created ON public.thought_stream(user_id, created_at DESC);

-- MEMORY_EVENTS
CREATE TABLE public.memory_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'observation',
  content TEXT NOT NULL,
  salience REAL NOT NULL DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.memory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memory events" ON public.memory_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own memory events" ON public.memory_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access memory_events" ON public.memory_events FOR ALL USING (auth.role() = 'service_role');

-- USER_SETTINGS (new version)
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  default_model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4',
  synthesis_style TEXT NOT NULL DEFAULT 'conversational',
  stream_responses BOOLEAN NOT NULL DEFAULT true,
  show_thinking BOOLEAN NOT NULL DEFAULT true,
  auto_title BOOLEAN NOT NULL DEFAULT true,
  interface_density TEXT NOT NULL DEFAULT 'default',
  font_size INTEGER NOT NULL DEFAULT 14,
  show_timestamps BOOLEAN NOT NULL DEFAULT true,
  show_agent_colors BOOLEAN NOT NULL DEFAULT true,
  clockbar_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access user_settings" ON public.user_settings FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STEP 3: Update handle_new_user_settings trigger to work with new schema
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Re-attach trigger to auth.users (it was on auth.users before via the old schema)
DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- ============================================
-- STEP 4: Enable realtime
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.cognitive_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.thought_stream;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
