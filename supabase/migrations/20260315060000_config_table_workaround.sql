-- ══════════════════════════════════════════════════════════════
-- Config table workaround for Lovable Cloud
-- ALTER DATABASE SET is blocked, so we store app config in a table
-- that trigger functions can read instead of current_setting().
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write this table (contains sensitive values)
CREATE POLICY "Service role full access" ON public.app_config
  FOR ALL USING (auth.role() = 'service_role');

-- Helper function to read config values (used by triggers)
CREATE OR REPLACE FUNCTION get_app_config(config_key TEXT)
RETURNS TEXT AS $$
  SELECT value FROM public.app_config WHERE key = config_key LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ── Update trigger_resonance to use config table ──

CREATE OR REPLACE FUNCTION trigger_resonance() RETURNS TRIGGER AS $$
DECLARE
  base_url TEXT;
  service_key TEXT;
  headers JSONB;
BEGIN
  -- Try config table first, fall back to current_setting
  base_url := get_app_config('supabase_url');
  IF base_url IS NULL THEN
    base_url := current_setting('app.supabase_url', true);
  END IF;

  service_key := get_app_config('service_role_key');
  IF service_key IS NULL THEN
    service_key := current_setting('app.service_role_key', true);
  END IF;

  IF base_url IS NULL OR service_key IS NULL THEN RETURN NEW; END IF;

  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || service_key,
    'Content-Type', 'application/json'
  );

  -- Question with high salience → connect related memories
  IF NEW.source = 'question' AND NEW.salience > 0.8 THEN
    PERFORM net.http_post(
      url := base_url || '/functions/v1/anima-connect',
      headers := headers,
      body := jsonb_build_object('user_id', NEW.user_id, 'trigger_context', NEW.content, 'cascade_depth', 1)
    );
  END IF;

  -- Connection with high salience → reflect deeper
  IF NEW.source = 'connection' AND NEW.salience > 0.7 THEN
    PERFORM net.http_post(
      url := base_url || '/functions/v1/anima-reflect',
      headers := headers,
      body := jsonb_build_object('user_id', NEW.user_id, 'trigger_context', NEW.content, 'cascade_depth', 1)
    );
  END IF;

  -- Dream with moderate salience → think about it
  IF NEW.source = 'dream' AND NEW.salience > 0.6 THEN
    PERFORM net.http_post(
      url := base_url || '/functions/v1/anima-think',
      headers := headers,
      body := jsonb_build_object('user_id', NEW.user_id, 'trigger_context', NEW.content, 'cascade_depth', 1)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── Update trigger_emotional_resonance to use config table ──

CREATE OR REPLACE FUNCTION trigger_emotional_resonance() RETURNS TRIGGER AS $$
DECLARE
  max_delta FLOAT;
  base_url TEXT;
  service_key TEXT;
  headers JSONB;
BEGIN
  base_url := get_app_config('supabase_url');
  IF base_url IS NULL THEN
    base_url := current_setting('app.supabase_url', true);
  END IF;

  service_key := get_app_config('service_role_key');
  IF service_key IS NULL THEN
    service_key := current_setting('app.service_role_key', true);
  END IF;

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
$$ LANGUAGE plpgsql SET search_path = public;
