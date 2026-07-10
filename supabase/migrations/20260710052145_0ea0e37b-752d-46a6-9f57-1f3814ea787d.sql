ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS image_provider text NOT NULL DEFAULT 'openrouter',
  ADD COLUMN IF NOT EXISTS image_model text NOT NULL DEFAULT 'google/gemini-2.5-flash-image';