
ALTER TABLE public.user_settings 
ADD COLUMN openrouter_api_key text;

COMMENT ON COLUMN public.user_settings.openrouter_api_key IS 'User-provided OpenRouter API key for personal usage';
