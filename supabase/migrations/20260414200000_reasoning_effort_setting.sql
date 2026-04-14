-- Add reasoning_effort column to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS reasoning_effort TEXT DEFAULT 'medium'
  CHECK (reasoning_effort IN ('low', 'medium', 'high'));
