CREATE TABLE public.memory_settings (
  user_id UUID NOT NULL PRIMARY KEY,
  mnemos_enabled BOOLEAN NOT NULL DEFAULT true,
  decay_rate INTEGER NOT NULL DEFAULT 50 CHECK (decay_rate >= 0 AND decay_rate <= 100),
  dream_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (dream_frequency IN ('hourly','6h','daily','weekly')),
  consolidation_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access memory_settings"
ON public.memory_settings FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own memory settings"
ON public.memory_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory settings"
ON public.memory_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory settings"
ON public.memory_settings FOR UPDATE
USING (auth.uid() = user_id);

CREATE TRIGGER update_memory_settings_updated_at
BEFORE UPDATE ON public.memory_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-provision row for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_memory_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.memory_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_memory_settings
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_memory_settings();