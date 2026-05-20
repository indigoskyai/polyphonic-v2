ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS voice_mode text NOT NULL DEFAULT 'text';
ALTER TABLE public.agent_configs ADD COLUMN IF NOT EXISTS elevenlabs_agent_id text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_voice_id text NOT NULL DEFAULT 'EXAVITQu4vr4xnSDxMaL';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS elevenlabs_agent_id text;

DROP VIEW IF EXISTS public.conversations;
CREATE VIEW public.conversations AS
SELECT id, user_id, title, created_at, updated_at, voice_mode FROM public.threads;