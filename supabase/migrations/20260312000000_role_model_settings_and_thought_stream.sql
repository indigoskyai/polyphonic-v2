-- Phase: Add role-based model settings to user_settings + thought_stream + daily_logs tables

-- ─── 1. Role-based model columns on user_settings ───
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS voice_model TEXT,
  ADD COLUMN IF NOT EXISTS dreamer_model TEXT,
  ADD COLUMN IF NOT EXISTS observer_models TEXT[] DEFAULT ARRAY['x-ai/grok-4','google/gemini-3-pro-preview','moonshotai/kimi-k2.5'],
  ADD COLUMN IF NOT EXISTS synthesis_model TEXT,
  ADD COLUMN IF NOT EXISTS belief_model TEXT,
  ADD COLUMN IF NOT EXISTS memory_model TEXT;

-- ─── 2. Thought stream table (background cognition output) ───
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

CREATE POLICY "Users can read own thoughts" ON public.thought_stream
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access thought_stream" ON public.thought_stream
  FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_thought_stream_user_time ON public.thought_stream(user_id, created_at DESC);
CREATE INDEX idx_thought_stream_user_source ON public.thought_stream(user_id, source);
CREATE INDEX idx_thought_stream_undelivered ON public.thought_stream(user_id, delivered) WHERE delivered = false;

-- ─── 3. Daily logs table (cognitive process run logs) ───
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own daily logs" ON public.daily_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access daily_logs" ON public.daily_logs
  FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_daily_logs_user_time ON public.daily_logs(user_id, created_at DESC);
CREATE INDEX idx_daily_logs_user_type ON public.daily_logs(user_id, log_type);
