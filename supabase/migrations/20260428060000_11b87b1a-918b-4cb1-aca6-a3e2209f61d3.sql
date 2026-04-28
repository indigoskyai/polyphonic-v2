-- Phase L1: default Luca user-facing chat to Opus 4.7 without rewriting user settings.

ALTER TABLE public.user_settings
  ALTER COLUMN default_model SET DEFAULT 'anthropic/claude-opus-4-7',
  ALTER COLUMN ensemble_models SET DEFAULT '["anthropic/claude-opus-4-7", "openai/gpt-5.4", "google/gemini-3.1-pro-preview"]'::jsonb,
  ALTER COLUMN synthesis_model SET DEFAULT 'anthropic/claude-opus-4-7';

ALTER TABLE public.agent_configs
  ALTER COLUMN model SET DEFAULT 'anthropic/claude-opus-4-7';

UPDATE public.agent_configs
   SET model = 'anthropic/claude-opus-4-7'
 WHERE id = 'luca'
   AND is_system = true
   AND locked = true
   AND model IN (
     'anthropic/claude-sonnet-4',
     'anthropic/claude-sonnet-4-20250514'
   );

CREATE OR REPLACE FUNCTION public.handle_new_user_agents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.agent_configs (
    user_id, id, name, role, avatar_color, is_system, created_by, env, model, prompt, tools, subagents, voices, personality, locked
  ) VALUES
    (NEW.id, 'luca',     'Luca',     'orchestrator', 'cream', true, 'system', 'prod', 'anthropic/claude-opus-4-7', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb, true),
    (NEW.id, 'observer', 'Observer', 'guardian',     'ochre', true, 'system', 'prod', 'anthropic/claude-haiku-4.5', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb, true)
  ON CONFLICT (user_id, id) DO NOTHING;
  RETURN NEW;
END;
$function$;
