-- ============ entity_activity_log ============
CREATE TABLE IF NOT EXISTS public.entity_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_type text NOT NULL,
  title text,
  summary text,
  content jsonb,
  emotional_context jsonb,
  source text DEFAULT 'autonomous',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entity_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activity log" ON public.entity_activity_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity log" ON public.entity_activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access entity_activity_log" ON public.entity_activity_log
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_entity_activity_log_user_created ON public.entity_activity_log (user_id, created_at DESC);
CREATE INDEX idx_entity_activity_log_user_type_created ON public.entity_activity_log (user_id, activity_type, created_at DESC);

-- ============ activity_events ============
-- Schema matches activity-gate.ts usage: event_type + metadata jsonb (filterable via metadata->>process)
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activity events" ON public.activity_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access activity_events" ON public.activity_events
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_activity_events_user_type_created ON public.activity_events (user_id, event_type, created_at DESC);
CREATE INDEX idx_activity_events_metadata_process ON public.activity_events ((metadata->>'process'));

-- ============ observer_logs ============
CREATE TABLE IF NOT EXISTS public.observer_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  model text,
  observations jsonb DEFAULT '[]'::jsonb,
  synthesis text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.observer_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own observer logs" ON public.observer_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access observer_logs" ON public.observer_logs
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_observer_logs_user_created ON public.observer_logs (user_id, created_at DESC);

-- ============ daily_logs ============
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  log_type text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  log_date date GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC')::date) STORED
);
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own daily logs" ON public.daily_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access daily_logs" ON public.daily_logs
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_daily_logs_user_date_type ON public.daily_logs (user_id, log_date DESC, log_type);
CREATE INDEX idx_daily_logs_user_created ON public.daily_logs (user_id, created_at DESC);

-- ============ emotional_history ============
-- Note: activity-gate.ts queries by `timestamp` column, not `created_at`. Honor that.
CREATE TABLE IF NOT EXISTS public.emotional_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emotional_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own emotional history" ON public.emotional_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access emotional_history" ON public.emotional_history
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX idx_emotional_history_user_timestamp ON public.emotional_history (user_id, timestamp DESC);

-- ============ conversations ============
-- DECISION: `conversations` is a LEGACY name for `threads`. Rather than create a duplicate
-- aggregation table, expose a VIEW so journal-write keeps working without code change.
-- messages.conversation_id is also a legacy reference to messages.thread_id — we will
-- patch journal-write in code separately to use thread_id. The VIEW handles read-side.
CREATE OR REPLACE VIEW public.conversations AS
  SELECT id, user_id, title, created_at, updated_at FROM public.threads;

-- ============ user_settings: new columns ============
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS observer_models text[],
  ADD COLUMN IF NOT EXISTS dreamer_model text,
  ADD COLUMN IF NOT EXISTS voice_model text;

-- ============ memories: missing columns being written ============
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS decay_factor numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS sharpness numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_watchlist boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_memories_user_decay ON public.memories (user_id, decay_factor);