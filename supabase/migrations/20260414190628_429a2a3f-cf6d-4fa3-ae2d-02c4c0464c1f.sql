
-- Enable pg_net for cron HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Add multi-model settings columns
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS multi_model_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ensemble_models JSONB DEFAULT '["anthropic/claude-sonnet-4-20250514", "openai/gpt-4o", "google/gemini-2.5-pro-preview-03-25"]'::jsonb,
  ADD COLUMN IF NOT EXISTS synthesis_model TEXT DEFAULT 'anthropic/claude-sonnet-4-20250514';
