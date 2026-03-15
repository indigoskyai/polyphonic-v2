-- Anima Inner Life: New tables for belief evolution, emotional state, observer panel, thought initiation
-- Also adds sharpness column to existing memories table for decay stage tracking

-- ─── 1. Beliefs table ───
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

CREATE POLICY "Users can read own beliefs" ON public.beliefs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own beliefs" ON public.beliefs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own beliefs" ON public.beliefs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own beliefs" ON public.beliefs
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access beliefs" ON public.beliefs
  FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_beliefs_user_id ON public.beliefs(user_id);
CREATE INDEX idx_beliefs_domain ON public.beliefs(user_id, domain);
CREATE INDEX idx_beliefs_stagnant ON public.beliefs(user_id, stagnant) WHERE active = true;

-- ─── 2. Emotional state table (current state per user) ───
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

CREATE POLICY "Users can read own emotional state" ON public.emotional_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access emotional_state" ON public.emotional_state
  FOR ALL USING (current_setting('role') = 'service_role');

-- ─── 3. Emotional history table (snapshots for charting) ───
CREATE TABLE IF NOT EXISTS public.emotional_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.emotional_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own emotional history" ON public.emotional_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access emotional_history" ON public.emotional_history
  FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_emotional_history_user_time ON public.emotional_history(user_id, timestamp DESC);

-- ─── 4. Observer logs table ───
CREATE TABLE IF NOT EXISTS public.observer_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  synthesis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.observer_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own observer logs" ON public.observer_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access observer_logs" ON public.observer_logs
  FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_observer_logs_user_time ON public.observer_logs(user_id, created_at DESC);

-- ─── 5. Add sharpness column to existing memories table ───
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS sharpness REAL DEFAULT 1.0;

-- ─── 6. Thought initiation tracking ───
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

CREATE POLICY "Users can read own initiations" ON public.thought_initiations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own initiations" ON public.thought_initiations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access initiations" ON public.thought_initiations
  FOR ALL USING (current_setting('role') = 'service_role');

CREATE INDEX idx_initiations_user_pending ON public.thought_initiations(user_id, status) WHERE status = 'pending';
