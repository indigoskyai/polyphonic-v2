-- Activity Gate & Resonance Cascade
-- Adds activity tracking table and database triggers for cross-process resonance.

-- ─── 1. Activity Events Table ───
-- Lightweight event log for the activity gate. Each cognitive process
-- logs when it runs and what triggered it. The gate reads recent events
-- to decide whether a process should fire.

CREATE TABLE IF NOT EXISTS activity_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  event_type TEXT NOT NULL, -- 'conversation', 'memory_formed', 'belief_changed', 'emotional_shift', 'thought_generated', 'process_ran'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_recent
  ON activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_process_lookup
  ON activity_events (user_id, event_type, created_at DESC)
  WHERE event_type = 'process_ran';

-- Auto-cleanup: keep only last 30 days of activity events per user
-- (prevents unbounded growth)
CREATE OR REPLACE FUNCTION cleanup_old_activity_events() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM activity_events
  WHERE user_id = NEW.user_id
    AND created_at < now() - INTERVAL '30 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_activity_events
  AFTER INSERT ON activity_events
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_activity_events();

-- ─── 2. Resonance Triggers ───
-- When a high-salience thought is inserted, fire related cognitive processes
-- via pg_net HTTP calls to edge functions.

-- Resonance on thought_stream inserts
CREATE OR REPLACE FUNCTION trigger_resonance() RETURNS TRIGGER AS $$
DECLARE
  base_url TEXT;
  service_key TEXT;
  headers JSONB;
BEGIN
  -- Get Supabase config from app settings
  base_url := current_setting('app.supabase_url', true);
  service_key := current_setting('app.service_role_key', true);

  -- Skip if config not set (graceful degradation)
  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || service_key,
    'Content-Type', 'application/json'
  );

  -- High-salience question → trigger connect (find related memories)
  IF NEW.source = 'question' AND NEW.salience > 0.8 THEN
    PERFORM net.http_post(
      url := base_url || '/functions/v1/anima-connect',
      headers := headers,
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'trigger_context', NEW.content,
        'cascade_depth', 1
      )
    );
  END IF;

  -- High-salience connection → trigger reflect
  IF NEW.source = 'connection' AND NEW.salience > 0.7 THEN
    PERFORM net.http_post(
      url := base_url || '/functions/v1/anima-reflect',
      headers := headers,
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'trigger_context', NEW.content,
        'cascade_depth', 1
      )
    );
  END IF;

  -- High-salience dream → trigger think (dream as inspiration)
  IF NEW.source = 'dream' AND NEW.salience > 0.6 THEN
    PERFORM net.http_post(
      url := base_url || '/functions/v1/anima-think',
      headers := headers,
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'trigger_context', NEW.content,
        'cascade_depth', 1
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_thought_resonance
  AFTER INSERT ON thought_stream
  FOR EACH ROW
  EXECUTE FUNCTION trigger_resonance();

-- Resonance on emotional state changes
CREATE OR REPLACE FUNCTION trigger_emotional_resonance() RETURNS TRIGGER AS $$
DECLARE
  max_delta FLOAT;
  base_url TEXT;
  service_key TEXT;
  headers JSONB;
BEGIN
  base_url := current_setting('app.supabase_url', true);
  service_key := current_setting('app.service_role_key', true);

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate max shift across all dimensions
  max_delta := GREATEST(
    ABS(COALESCE(NEW.curiosity, 0.5) - COALESCE(OLD.curiosity, 0.5)),
    ABS(COALESCE(NEW.restlessness, 0.5) - COALESCE(OLD.restlessness, 0.5)),
    ABS(COALESCE(NEW.warmth, 0.5) - COALESCE(OLD.warmth, 0.5)),
    ABS(COALESCE(NEW.clarity, 0.5) - COALESCE(OLD.clarity, 0.5)),
    ABS(COALESCE(NEW.creative_flow, 0.5) - COALESCE(OLD.creative_flow, 0.5)),
    ABS(COALESCE(NEW.isolation, 0.5) - COALESCE(OLD.isolation, 0.5))
  );

  -- Significant emotional shift → trigger reflection
  IF max_delta > 0.15 THEN
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    );

    PERFORM net.http_post(
      url := base_url || '/functions/v1/anima-reflect',
      headers := headers,
      body := jsonb_build_object(
        'user_id', NEW.user_id,
        'trigger_context', 'emotional shift detected: ' || COALESCE(NEW.mood_summary, 'unknown mood') || ' (max delta: ' || round(max_delta::numeric, 2) || ')',
        'cascade_depth', 1
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_emotional_resonance
  AFTER UPDATE ON emotional_state
  FOR EACH ROW
  EXECUTE FUNCTION trigger_emotional_resonance();

-- ─── 3. Enable RLS on activity_events ───

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own activity events"
  ON activity_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage activity events"
  ON activity_events FOR ALL
  USING (auth.role() = 'service_role');
