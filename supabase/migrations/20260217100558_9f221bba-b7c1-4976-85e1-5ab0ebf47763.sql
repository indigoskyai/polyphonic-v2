ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS nickname text DEFAULT '',
  ADD COLUMN IF NOT EXISTS occupation text DEFAULT '',
  ADD COLUMN IF NOT EXISTS about_me text DEFAULT '';