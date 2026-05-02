ALTER TABLE public.memory_settings
ADD COLUMN IF NOT EXISTS last_consolidated_at TIMESTAMPTZ;