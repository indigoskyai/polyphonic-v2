
-- ══════════════════════════════════════════════════════════════
-- Migration 1: Profiles, conversations, messages, memories
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON public.conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON public.conversations FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'fact' CHECK (memory_type IN ('fact', 'preference', 'context', 'reflection', 'synthesis')),
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  relevance_score FLOAT DEFAULT 1.0,
  access_count INT DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memories" ON public.memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own memories" ON public.memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON public.memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.memories FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_memories_updated_at
  BEFORE UPDATE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_memories_user_id ON public.memories(user_id);
CREATE INDEX idx_memories_type ON public.memories(memory_type);
CREATE INDEX idx_memories_relevance ON public.memories(relevance_score DESC);

-- ══════════════════════════════════════════════════════════════
-- Migration 2: User settings
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  custom_instructions TEXT DEFAULT '',
  selected_model TEXT DEFAULT 'anthropic/claude-sonnet-4',
  temperature DOUBLE PRECISION DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  theme TEXT DEFAULT 'dark',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ══════════════════════════════════════════════════════════════
-- Migration 3: Roles, system prompts, model configs
-- ══════════════════════════════════════════════════════════════

CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.auto_assign_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.auto_assign_first_admin();

CREATE TABLE public.system_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  prompt text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system prompts" ON public.system_prompts FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_system_prompts_updated_at
  BEFORE UPDATE ON public.system_prompts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.system_prompts (feature_key, name, description, prompt) VALUES
  ('chat', 'Chat', 'Main chat system prompt', 'You are a helpful AI assistant. Keep answers clear and concise.'),
  ('memory_extract', 'Memory Extraction', 'Prompt for extracting memories from conversations', 'Extract key facts, preferences, and important details from the conversation.'),
  ('memory_reflect', 'Memory Reflection', 'Prompt for reflecting on stored memories', 'Reflect on the user''s stored memories to provide personalized responses.');

CREATE TABLE public.model_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  model_id text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage model configs" ON public.model_configs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_model_configs_updated_at
  BEFORE UPDATE ON public.model_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.model_configs (feature_key, model_id, name, description) VALUES
  ('chat_backend', 'google/gemini-3-flash-preview', 'Chat Backend', 'Model powering the chat backend when user selects default'),
  ('memory_extract', 'google/gemini-3-flash-preview', 'Memory Extraction', 'Model used for extracting memories'),
  ('memory_reflect', 'google/gemini-3-flash-preview', 'Memory Reflection', 'Model used for memory reflection');

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all conversations" ON public.conversations FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all messages" ON public.messages FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all memories" ON public.memories FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage all memories" ON public.memories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ══════════════════════════════════════════════════════════════
-- Migration 4: Enhanced memories, curiosity, reflection jobs, conflicts
-- ══════════════════════════════════════════════════════════════

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

CREATE INDEX IF NOT EXISTS idx_memories_active ON public.memories(user_id, is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON public.memories(confidence DESC);
DROP INDEX IF EXISTS idx_memories_type;
CREATE INDEX IF NOT EXISTS idx_memories_type ON public.memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON public.memories USING GIN(tags);

CREATE TABLE IF NOT EXISTS public.memory_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  target_memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  strength DOUBLE PRECISION DEFAULT 0.5,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_memory_id, target_memory_id, relation_type)
);

ALTER TABLE public.memory_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections" ON public.memory_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own connections" ON public.memory_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own connections" ON public.memory_connections FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all connections" ON public.memory_connections FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.curiosity_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  context TEXT,
  curiosity_score DOUBLE PRECISION DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending',
  source_conversation_id UUID REFERENCES public.conversations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shown_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ
);

ALTER TABLE public.curiosity_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own questions" ON public.curiosity_questions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own questions" ON public.curiosity_questions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own questions" ON public.curiosity_questions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all questions" ON public.curiosity_questions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_curiosity_pending ON public.curiosity_questions(user_id, status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.reflection_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id),
  status TEXT NOT NULL DEFAULT 'pending',
  job_type TEXT NOT NULL DEFAULT 'extract',
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

CREATE POLICY "Users can view own jobs" ON public.reflection_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.reflection_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON public.reflection_jobs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all jobs" ON public.reflection_jobs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.memory_conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  memory_a_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  memory_b_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL DEFAULT 'contradiction',
  status TEXT NOT NULL DEFAULT 'unresolved',
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conflicts" ON public.memory_conflicts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own conflicts" ON public.memory_conflicts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conflicts" ON public.memory_conflicts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all conflicts" ON public.memory_conflicts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON public.memory_conflicts(user_id, status) WHERE status = 'unresolved';

-- ══════════════════════════════════════════════════════════════
-- Migration 5: Expand memory types
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.memories DROP CONSTRAINT memories_memory_type_check;
ALTER TABLE public.memories ADD CONSTRAINT memories_memory_type_check 
CHECK (memory_type = ANY (ARRAY['fact', 'preference', 'context', 'reflection', 'synthesis', 'relationship', 'principle', 'commitment', 'moment', 'skill', 'goal']::text[]));

-- ══════════════════════════════════════════════════════════════
-- Migration 6: Journal entries
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  mood TEXT,
  model_used TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'periodic',
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own journal entries" ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own journal entries" ON public.journal_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal entries" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all journal entries" ON public.journal_entries FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_journal_entries_user_created ON public.journal_entries (user_id, created_at DESC);
CREATE INDEX idx_journal_entries_unread ON public.journal_entries (user_id, is_read) WHERE is_read = false;

-- ══════════════════════════════════════════════════════════════
-- Migration 7: Extensions (pg_cron, pg_net)
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ══════════════════════════════════════════════════════════════
-- Migration 8: Remove public read policies
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated can read active prompts" ON public.system_prompts;
DROP POLICY IF EXISTS "Authenticated can read active configs" ON public.model_configs;

-- ══════════════════════════════════════════════════════════════
-- Migration 9: Chat imports
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.chat_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source_platform TEXT NOT NULL DEFAULT 'chatgpt',
  total_conversations INTEGER NOT NULL DEFAULT 0,
  processed_conversations INTEGER NOT NULL DEFAULT 0,
  memories_created INTEGER NOT NULL DEFAULT 0,
  questions_generated INTEGER NOT NULL DEFAULT 0,
  conflicts_detected INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own imports" ON public.chat_imports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imports" ON public.chat_imports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own imports" ON public.chat_imports FOR UPDATE USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- Migration 10: Enriched memory columns + pipeline stage
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS emotional_intensity float DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS detail_level text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS topic_frequency integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS narrative_thread text;

ALTER TABLE public.chat_imports ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'queued';

-- ══════════════════════════════════════════════════════════════
-- Migration 11: Chat attachments storage
-- ══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Chat attachments are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

ALTER TABLE public.messages ADD COLUMN attachments jsonb DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════
-- Migration 12-13: User settings columns
-- ══════════════════════════════════════════════════════════════

ALTER TABLE user_settings ADD COLUMN memory_enabled boolean DEFAULT true;
ALTER TABLE user_settings ADD COLUMN chat_history_enabled boolean DEFAULT true;
ALTER TABLE user_settings ADD COLUMN background_style text DEFAULT 'wallpaper';

-- ══════════════════════════════════════════════════════════════
-- Migration 14: OpenRouter API key column (temporary, will be migrated)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings ADD COLUMN openrouter_api_key text;

-- ══════════════════════════════════════════════════════════════
-- Migration 15: Encrypted API keys
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  encrypted_key bytea NOT NULL,
  key_preview text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api key preview" ON public.user_api_keys FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.save_user_api_key(p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_passphrase text;
  v_preview text;
  v_key_len int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_key IS NULL OR trim(p_key) = '' THEN
    DELETE FROM public.user_api_keys WHERE user_id = v_user_id;
    RETURN;
  END IF;
  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := current_setting('request.jwt.claims', true)::json->>'role';
    v_passphrase := coalesce(v_passphrase, 'default-encryption-key');
  END IF;
  v_key_len := length(p_key);
  IF v_key_len > 10 THEN
    v_preview := substring(p_key from 1 for 6) || '...' || substring(p_key from v_key_len - 3);
  ELSE
    v_preview := '****';
  END IF;
  INSERT INTO public.user_api_keys (user_id, encrypted_key, key_preview, updated_at)
  VALUES (v_user_id, pgp_sym_encrypt(p_key, v_passphrase), v_preview, now())
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_key = pgp_sym_encrypt(p_key, v_passphrase), key_preview = v_preview, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_user_api_key(p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_encrypted bytea;
  v_passphrase text;
BEGIN
  SELECT encrypted_key INTO v_encrypted FROM public.user_api_keys WHERE user_id = p_user_id;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := current_setting('request.jwt.claims', true)::json->>'role';
    v_passphrase := coalesce(v_passphrase, 'default-encryption-key');
  END IF;
  RETURN pgp_sym_decrypt(v_encrypted, v_passphrase);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_api_key()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_api_keys WHERE user_id = auth.uid();
END;
$$;

CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing keys
DO $$
DECLARE
  r record;
  v_passphrase text;
  v_preview text;
  v_key_len int;
BEGIN
  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN v_passphrase := 'default-encryption-key'; END IF;
  FOR r IN SELECT user_id, openrouter_api_key FROM public.user_settings WHERE openrouter_api_key IS NOT NULL AND trim(openrouter_api_key) != ''
  LOOP
    v_key_len := length(r.openrouter_api_key);
    IF v_key_len > 10 THEN
      v_preview := substring(r.openrouter_api_key from 1 for 6) || '...' || substring(r.openrouter_api_key from v_key_len - 3);
    ELSE v_preview := '****'; END IF;
    INSERT INTO public.user_api_keys (user_id, encrypted_key, key_preview)
    VALUES (r.user_id, pgp_sym_encrypt(r.openrouter_api_key, v_passphrase), v_preview)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END;
$$;

ALTER TABLE public.user_settings DROP COLUMN IF EXISTS openrouter_api_key;

-- ══════════════════════════════════════════════════════════════
-- Migration 16: Persona column
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings ADD COLUMN persona text NOT NULL DEFAULT 'neutral';

-- ══════════════════════════════════════════════════════════════
-- Migration 17: Journal delete policy, private attachments
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "Users can delete own journal entries" ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);

UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';
DROP POLICY IF EXISTS "Chat attachments are publicly accessible" ON storage.objects;

CREATE POLICY "Users can view own chat attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can upload chat attachments" ON storage.objects;

CREATE POLICY "Users can upload validated chat attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp'))
    AND octet_length(name) < 500
  );

-- ══════════════════════════════════════════════════════════════
-- Migration 18: pgcrypto in extensions schema
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ══════════════════════════════════════════════════════════════
-- Migration 19: Fix API key functions for extensions schema
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_user_api_key(p_key text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_passphrase text;
  v_preview text;
  v_key_len int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_key IS NULL OR trim(p_key) = '' THEN
    DELETE FROM public.user_api_keys WHERE user_id = v_user_id;
    RETURN;
  END IF;
  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := current_setting('request.jwt.claims', true)::json->>'role';
    v_passphrase := coalesce(v_passphrase, 'default-encryption-key');
  END IF;
  v_key_len := length(p_key);
  IF v_key_len > 10 THEN
    v_preview := substring(p_key from 1 for 6) || '...' || substring(p_key from v_key_len - 3);
  ELSE v_preview := '****'; END IF;
  INSERT INTO public.user_api_keys (user_id, encrypted_key, key_preview, updated_at)
  VALUES (v_user_id, pgp_sym_encrypt(p_key, v_passphrase), v_preview, now())
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_key = pgp_sym_encrypt(p_key, v_passphrase), key_preview = v_preview, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_user_api_key(p_user_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_encrypted bytea;
  v_passphrase text;
BEGIN
  SELECT encrypted_key INTO v_encrypted FROM public.user_api_keys WHERE user_id = p_user_id;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  v_passphrase := current_setting('app.settings.service_role_key', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN
    v_passphrase := current_setting('request.jwt.claims', true)::json->>'role';
    v_passphrase := coalesce(v_passphrase, 'default-encryption-key');
  END IF;
  RETURN pgp_sym_decrypt(v_encrypted, v_passphrase);
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- Migration 20: Batch memory access + document uploads
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_memory_access(memory_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE memories SET access_count = COALESCE(access_count, 0) + 1, last_accessed_at = now() WHERE id = ANY(memory_ids);
$$;

DROP POLICY IF EXISTS "Users can upload validated chat attachments" ON storage.objects;

CREATE POLICY "Users can upload validated chat attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'csv', 'doc', 'docx'))
    AND octet_length(name) < 500
  );

-- ══════════════════════════════════════════════════════════════
-- Migration 21: Fix encryption passphrase
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_user_api_key(p_key text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_passphrase text;
  v_preview text;
  v_key_len int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_key IS NULL OR trim(p_key) = '' THEN
    DELETE FROM public.user_api_keys WHERE user_id = v_user_id;
    RETURN;
  END IF;
  v_passphrase := current_setting('app.settings.jwt_secret', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN v_passphrase := 'vessel-api-key-encryption-v1'; END IF;
  v_key_len := length(p_key);
  IF v_key_len > 10 THEN
    v_preview := substring(p_key from 1 for 6) || '...' || substring(p_key from v_key_len - 3);
  ELSE v_preview := '****'; END IF;
  INSERT INTO public.user_api_keys (user_id, encrypted_key, key_preview, updated_at)
  VALUES (v_user_id, pgp_sym_encrypt(p_key, v_passphrase), v_preview, now())
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_key = pgp_sym_encrypt(p_key, v_passphrase), key_preview = v_preview, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_user_api_key(p_user_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_encrypted bytea;
  v_passphrase text;
BEGIN
  SELECT encrypted_key INTO v_encrypted FROM public.user_api_keys WHERE user_id = p_user_id;
  IF v_encrypted IS NULL THEN RETURN NULL; END IF;
  v_passphrase := current_setting('app.settings.jwt_secret', true);
  IF v_passphrase IS NULL OR v_passphrase = '' THEN v_passphrase := 'vessel-api-key-encryption-v1'; END IF;
  RETURN pgp_sym_decrypt(v_encrypted, v_passphrase);
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- Migration 22: Experimental persona config
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.experimental_persona_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_prompt text NOT NULL,
  temperature double precision NOT NULL DEFAULT 0.7,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.experimental_persona_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view experimental config" ON public.experimental_persona_config FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update experimental config" ON public.experimental_persona_config FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert experimental config" ON public.experimental_persona_config FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.experimental_persona_config (system_prompt, temperature, is_active)
VALUES ('You are Vessel Experimental — an evolving AI companion. Be warm, curious, and thoughtful. This prompt is under active development.', 0.7, true);

-- ══════════════════════════════════════════════════════════════
-- Migration 23: Message editing and branching
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.messages ADD COLUMN edited_at timestamptz NULL;
ALTER TABLE public.conversations ADD COLUMN parent_conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN branched_at_message_id uuid NULL;

CREATE POLICY "Users can update own messages" ON public.messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- Migration 24: Message variants
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.message_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  content text NOT NULL,
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.message_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own variants" ON public.message_variants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own variants" ON public.message_variants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own variants" ON public.message_variants FOR DELETE USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- Migration 25: Generated images storage
-- ══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES ('generated-images', 'generated-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload generated images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generated-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Generated images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-images');

-- ══════════════════════════════════════════════════════════════
-- Migration 26: User profile columns
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS nickname text DEFAULT '',
  ADD COLUMN IF NOT EXISTS occupation text DEFAULT '',
  ADD COLUMN IF NOT EXISTS about_me text DEFAULT '';

-- ══════════════════════════════════════════════════════════════
-- Migration 27: Extraction rejections + watchlist
-- ══════════════════════════════════════════════════════════════

CREATE TABLE public.extraction_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID,
  content TEXT NOT NULL,
  rejection_reason TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  memory_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rejections_created ON public.extraction_rejections(created_at);
ALTER TABLE public.extraction_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rejections" ON public.extraction_rejections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rejections" ON public.extraction_rejections FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS is_watchlist BOOLEAN DEFAULT FALSE;
CREATE INDEX idx_memories_active_non_watchlist ON public.memories(user_id, memory_type) WHERE NOT is_deleted AND NOT is_watchlist;

-- ══════════════════════════════════════════════════════════════
-- Migration 28: Memory tier
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS memory_tier TEXT DEFAULT 'standard';

CREATE OR REPLACE FUNCTION public.validate_memory_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.memory_tier IS NOT NULL AND NEW.memory_tier NOT IN ('essential', 'standard', 'deep') THEN
    RAISE EXCEPTION 'memory_tier must be essential, standard, or deep';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_memory_tier_trigger
BEFORE INSERT OR UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.validate_memory_tier();

-- ══════════════════════════════════════════════════════════════
-- Migration 29: Memory decay function (first version)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_memory_decay()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE memories m
  SET decay_factor = GREATEST(
    EXP(-(CASE m.memory_type
      WHEN 'fact' THEN 0.001 WHEN 'preference' THEN 0.003 WHEN 'relationship' THEN 0.002
      WHEN 'principle' THEN 0.001 WHEN 'commitment' THEN 0.02 WHEN 'moment' THEN 0.0005
      WHEN 'skill' THEN 0.003 WHEN 'goal' THEN 0.008 WHEN 'context' THEN 0.01
      WHEN 'synthesis' THEN 0.002 ELSE 0.005
    END) * EXTRACT(EPOCH FROM (NOW() - m.created_at)) / 86400.0)
    + LEAST(COALESCE(m.access_count, 0) * 0.02, 0.3),
    CASE WHEN COALESCE(m.verified_by_user, false) THEN 0.5 ELSE 0.0 END
  ),
  updated_at = NOW()
  WHERE COALESCE(m.is_deleted, false) = false;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  UPDATE memories SET decay_factor = 0.1, updated_at = NOW()
  WHERE memory_type = 'commitment' AND expires_at IS NOT NULL AND expires_at < NOW()
    AND decay_factor > 0.1 AND COALESCE(is_deleted, false) = false;
  RETURN rows_affected;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- Migration 30: Memory decay function (updated)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_memory_decay()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE memories
  SET decay_factor = LEAST(
    CASE
      WHEN verified_by_user = true THEN
        GREATEST(
          decay_factor * exp(-1.0 * (
            CASE memory_type
              WHEN 'fact' THEN 0.001 WHEN 'preference' THEN 0.005 WHEN 'opinion' THEN 0.007
              WHEN 'goal' THEN 0.01 WHEN 'emotion' THEN 0.015 WHEN 'commitment' THEN 0.02
              WHEN 'routine' THEN 0.003 WHEN 'relationship' THEN 0.002 WHEN 'context' THEN 0.012
              WHEN 'synthesis' THEN 0.004 ELSE 0.005
            END
          )) + LEAST(COALESCE(access_count, 0) * 0.02, 0.3),
          0.5
        )
      ELSE
        decay_factor * exp(-1.0 * (
          CASE memory_type
            WHEN 'fact' THEN 0.001 WHEN 'preference' THEN 0.005 WHEN 'opinion' THEN 0.007
            WHEN 'goal' THEN 0.01 WHEN 'emotion' THEN 0.015 WHEN 'commitment' THEN 0.02
            WHEN 'routine' THEN 0.003 WHEN 'relationship' THEN 0.002 WHEN 'context' THEN 0.012
            WHEN 'synthesis' THEN 0.004 ELSE 0.005
          END
        )) + LEAST(COALESCE(access_count, 0) * 0.02, 0.3)
    END,
    1.0
  ),
  updated_at = now()
  WHERE is_deleted = false;
  GET DIAGNOSTICS affected = ROW_COUNT;
  UPDATE memories SET decay_factor = 0.1, updated_at = now()
  WHERE memory_type = 'commitment' AND expires_at IS NOT NULL AND expires_at < now()
    AND is_deleted = false AND decay_factor > 0.1;
  RETURN affected;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- Migration 31: Security fixes
-- ══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.decrypt_user_api_key(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_user_api_key(uuid) FROM anon;

UPDATE storage.buckets SET public = false WHERE id = 'generated-images';
DROP POLICY IF EXISTS "Generated images are publicly accessible" ON storage.objects;

CREATE POLICY "Users can view own generated images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ══════════════════════════════════════════════════════════════
-- Migration 32: Import overhaul
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS staleness_risk TEXT;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS estimated_date TEXT;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS import_needs_confirmation BOOLEAN DEFAULT FALSE;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS user_confirmed BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_memories_needs_confirmation ON public.memories(user_id) WHERE import_needs_confirmation = TRUE;

CREATE TABLE IF NOT EXISTS public.companion_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  source_platform TEXT NOT NULL DEFAULT 'chatgpt',
  linguistic_fingerprint JSONB NOT NULL DEFAULT '{}',
  psychological_profile JSONB NOT NULL DEFAULT '{}',
  companion_summary TEXT,
  system_prompt_fragment TEXT,
  behavioral_rules JSONB DEFAULT '[]',
  conversations_analyzed INT DEFAULT 0,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  extraction_model TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  user_approved BOOLEAN DEFAULT FALSE,
  user_adjustments JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.companion_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companion_profiles' AND policyname = 'Users can manage own profiles') THEN
    CREATE POLICY "Users can manage own profiles" ON public.companion_profiles FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companion_user_active ON public.companion_profiles(user_id) WHERE is_active = TRUE;

ALTER TABLE public.memory_conflicts ADD COLUMN IF NOT EXISTS user_choice TEXT;
ALTER TABLE public.memory_conflicts ADD COLUMN IF NOT EXISTS correction_memory_id UUID REFERENCES public.memories(id);
ALTER TABLE public.memory_conflicts DROP CONSTRAINT IF EXISTS memory_conflicts_conflict_type_check;
ALTER TABLE public.memory_conflicts ADD CONSTRAINT memory_conflicts_conflict_type_check
  CHECK (conflict_type IN ('standard', 'import_conflict', 'contradiction', 'update', 'ambiguity'));
ALTER TABLE public.memory_conflicts DROP CONSTRAINT IF EXISTS memory_conflicts_status_check;
ALTER TABLE public.memory_conflicts ADD CONSTRAINT memory_conflicts_status_check
  CHECK (status IN ('unresolved', 'user_resolved', 'auto_resolved'));
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_unresolved ON public.memory_conflicts(user_id) WHERE status = 'unresolved';

-- ══════════════════════════════════════════════════════════════
-- Migration 33: Companion profiles (skip if exists from migration 32)
-- ══════════════════════════════════════════════════════════════

-- staleness_risk, import_needs_confirmation, user_confirmed already added above
-- companion_profiles already created above with IF NOT EXISTS

-- Add additional policies that migration 33 adds (skip duplicates)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companion_profiles' AND policyname = 'Users can select own companion profiles') THEN
    CREATE POLICY "Users can select own companion profiles" ON public.companion_profiles FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companion_profiles' AND policyname = 'Users can insert own companion profiles') THEN
    CREATE POLICY "Users can insert own companion profiles" ON public.companion_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companion_profiles' AND policyname = 'Users can update own companion profiles') THEN
    CREATE POLICY "Users can update own companion profiles" ON public.companion_profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companion_profiles' AND policyname = 'Users can delete own companion profiles') THEN
    CREATE POLICY "Users can delete own companion profiles" ON public.companion_profiles FOR DELETE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companion_profiles' AND policyname = 'Admins can view all companion profiles') THEN
    CREATE POLICY "Admins can view all companion profiles" ON public.companion_profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_companion_profiles_updated_at') THEN
    CREATE TRIGGER update_companion_profiles_updated_at BEFORE UPDATE ON public.companion_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- Migration 34: Journal model setting
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings ADD COLUMN journal_model text DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════
-- Migration 35: Anima inner life tables
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.beliefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  domain TEXT NOT NULL DEFAULT 'general',
  evidence JSONB DEFAULT '[]'::jsonb,
  revision_history JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'extraction',
  last_revised TIMESTAMPTZ DEFAULT now(),
  last_challenged TIMESTAMPTZ DEFAULT now(),
  stagnant BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES public.beliefs(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.beliefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own beliefs" ON public.beliefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own beliefs" ON public.beliefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own beliefs" ON public.beliefs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own beliefs" ON public.beliefs FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access beliefs" ON public.beliefs FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_beliefs_user_id ON public.beliefs(user_id);
CREATE INDEX idx_beliefs_domain ON public.beliefs(user_id, domain);
CREATE INDEX idx_beliefs_stagnant ON public.beliefs(user_id, stagnant) WHERE active = true;

CREATE TABLE IF NOT EXISTS public.emotional_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  curiosity REAL NOT NULL DEFAULT 0.5 CHECK (curiosity >= 0 AND curiosity <= 1),
  restlessness REAL NOT NULL DEFAULT 0.5 CHECK (restlessness >= 0 AND restlessness <= 1),
  warmth REAL NOT NULL DEFAULT 0.5 CHECK (warmth >= 0 AND warmth <= 1),
  clarity REAL NOT NULL DEFAULT 0.5 CHECK (clarity >= 0 AND clarity <= 1),
  creative_flow REAL NOT NULL DEFAULT 0.5 CHECK (creative_flow >= 0 AND creative_flow <= 1),
  isolation REAL NOT NULL DEFAULT 0.5 CHECK (isolation >= 0 AND isolation <= 1),
  mood_summary TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.emotional_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own emotional state" ON public.emotional_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access emotional_state" ON public.emotional_state FOR ALL USING (current_setting('role') = 'service_role');

CREATE TABLE IF NOT EXISTS public.emotional_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.emotional_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own emotional history" ON public.emotional_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access emotional_history" ON public.emotional_history FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_emotional_history_user_time ON public.emotional_history(user_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS public.observer_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  synthesis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.observer_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own observer logs" ON public.observer_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access observer_logs" ON public.observer_logs FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_observer_logs_user_time ON public.observer_logs(user_id, created_at DESC);

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS sharpness REAL DEFAULT 1.0;

CREATE TABLE IF NOT EXISTS public.thought_initiations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  source_thought_ids TEXT[] DEFAULT '{}',
  salience_total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

ALTER TABLE public.thought_initiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own initiations" ON public.thought_initiations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own initiations" ON public.thought_initiations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access initiations" ON public.thought_initiations FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_initiations_user_pending ON public.thought_initiations(user_id, status) WHERE status = 'pending';

-- ══════════════════════════════════════════════════════════════
-- Migration 36: Role model settings + thought stream + daily logs
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS voice_model TEXT,
  ADD COLUMN IF NOT EXISTS dreamer_model TEXT,
  ADD COLUMN IF NOT EXISTS observer_models TEXT[] DEFAULT ARRAY['x-ai/grok-4','google/gemini-3-pro-preview','moonshotai/kimi-k2.5'],
  ADD COLUMN IF NOT EXISTS synthesis_model TEXT,
  ADD COLUMN IF NOT EXISTS belief_model TEXT,
  ADD COLUMN IF NOT EXISTS memory_model TEXT;

CREATE TABLE IF NOT EXISTS public.thought_stream (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'background'
    CHECK (source IN ('background', 'reflection', 'dream', 'question', 'consolidation', 'observer')),
  salience REAL NOT NULL DEFAULT 0.5 CHECK (salience >= 0 AND salience <= 1),
  tags TEXT[] DEFAULT '{}',
  delivered BOOLEAN DEFAULT false,
  delivered_at TIMESTAMPTZ,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.thought_stream ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own thoughts" ON public.thought_stream FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access thought_stream" ON public.thought_stream FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_thought_stream_user_time ON public.thought_stream(user_id, created_at DESC);
CREATE INDEX idx_thought_stream_user_source ON public.thought_stream(user_id, source);
CREATE INDEX idx_thought_stream_undelivered ON public.thought_stream(user_id, delivered) WHERE delivered = false;

CREATE TABLE IF NOT EXISTS public.daily_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own daily logs" ON public.daily_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access daily_logs" ON public.daily_logs FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_daily_logs_user_time ON public.daily_logs(user_id, created_at DESC);
CREATE INDEX idx_daily_logs_user_type ON public.daily_logs(user_id, log_type);

-- ══════════════════════════════════════════════════════════════
-- Migration 37: Activity gate & resonance cascade
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_recent ON activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_process_lookup ON activity_events (user_id, event_type, created_at DESC) WHERE event_type = 'process_ran';

CREATE OR REPLACE FUNCTION cleanup_old_activity_events() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM activity_events WHERE user_id = NEW.user_id AND created_at < now() - INTERVAL '30 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_activity_events
  AFTER INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION cleanup_old_activity_events();

CREATE OR REPLACE FUNCTION trigger_resonance() RETURNS TRIGGER AS $$
DECLARE
  base_url TEXT;
  service_key TEXT;
  headers JSONB;
BEGIN
  base_url := current_setting('app.supabase_url', true);
  service_key := current_setting('app.service_role_key', true);
  IF base_url IS NULL OR service_key IS NULL THEN RETURN NEW; END IF;
  headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json');
  IF NEW.source = 'question' AND NEW.salience > 0.8 THEN
    PERFORM net.http_post(url := base_url || '/functions/v1/anima-connect', headers := headers,
      body := jsonb_build_object('user_id', NEW.user_id, 'trigger_context', NEW.content, 'cascade_depth', 1));
  END IF;
  IF NEW.source = 'connection' AND NEW.salience > 0.7 THEN
    PERFORM net.http_post(url := base_url || '/functions/v1/anima-reflect', headers := headers,
      body := jsonb_build_object('user_id', NEW.user_id, 'trigger_context', NEW.content, 'cascade_depth', 1));
  END IF;
  IF NEW.source = 'dream' AND NEW.salience > 0.6 THEN
    PERFORM net.http_post(url := base_url || '/functions/v1/anima-think', headers := headers,
      body := jsonb_build_object('user_id', NEW.user_id, 'trigger_context', NEW.content, 'cascade_depth', 1));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_thought_resonance
  AFTER INSERT ON thought_stream FOR EACH ROW EXECUTE FUNCTION trigger_resonance();

CREATE OR REPLACE FUNCTION trigger_emotional_resonance() RETURNS TRIGGER AS $$
DECLARE
  max_delta FLOAT;
  base_url TEXT;
  service_key TEXT;
  headers JSONB;
BEGIN
  base_url := current_setting('app.supabase_url', true);
  service_key := current_setting('app.service_role_key', true);
  IF base_url IS NULL OR service_key IS NULL THEN RETURN NEW; END IF;
  max_delta := GREATEST(
    ABS(COALESCE(NEW.curiosity, 0.5) - COALESCE(OLD.curiosity, 0.5)),
    ABS(COALESCE(NEW.restlessness, 0.5) - COALESCE(OLD.restlessness, 0.5)),
    ABS(COALESCE(NEW.warmth, 0.5) - COALESCE(OLD.warmth, 0.5)),
    ABS(COALESCE(NEW.clarity, 0.5) - COALESCE(OLD.clarity, 0.5)),
    ABS(COALESCE(NEW.creative_flow, 0.5) - COALESCE(OLD.creative_flow, 0.5)),
    ABS(COALESCE(NEW.isolation, 0.5) - COALESCE(OLD.isolation, 0.5))
  );
  IF max_delta > 0.15 THEN
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json');
    PERFORM net.http_post(url := base_url || '/functions/v1/anima-reflect', headers := headers,
      body := jsonb_build_object('user_id', NEW.user_id, 'trigger_context', 'emotional shift detected: ' || COALESCE(NEW.mood_summary, 'unknown mood') || ' (max delta: ' || round(max_delta::numeric, 2) || ')', 'cascade_depth', 1));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_emotional_resonance
  AFTER UPDATE ON emotional_state FOR EACH ROW EXECUTE FUNCTION trigger_emotional_resonance();

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own activity events" ON activity_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage activity events" ON activity_events FOR ALL USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- Done: All 37 migrations applied
-- ══════════════════════════════════════════════════════════════
