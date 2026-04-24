-- Phase A: extend agent_configs to support user-created agents
ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS avatar_color text DEFAULT 'cream',
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS personality jsonb NOT NULL DEFAULT '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb,
  ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;

-- Backfill name/role/avatar_color for existing rows based on the well-known seed ids
UPDATE public.agent_configs SET
  name = CASE id
    WHEN 'luca' THEN 'Luca'
    WHEN 'vektor' THEN 'Vektor'
    WHEN 'anima' THEN 'Anima'
    WHEN 'observer' THEN 'Observer'
    ELSE COALESCE(name, initcap(id))
  END,
  role = CASE id
    WHEN 'luca' THEN 'orchestrator'
    WHEN 'vektor' THEN 'analyst'
    WHEN 'anima' THEN 'empath'
    WHEN 'observer' THEN 'guardian'
    ELSE COALESCE(role, 'custom')
  END,
  avatar_color = CASE id
    WHEN 'luca' THEN 'cream'
    WHEN 'vektor' THEN 'blue'
    WHEN 'anima' THEN 'magenta'
    WHEN 'observer' THEN 'ochre'
    ELSE COALESCE(avatar_color, 'cream')
  END,
  is_system = CASE WHEN id IN ('luca','vektor','anima','observer') THEN true ELSE is_system END,
  created_by = CASE WHEN id IN ('luca','vektor','anima','observer') THEN 'system' ELSE created_by END
WHERE name IS NULL OR role IS NULL;

-- After backfill, name + role become required
ALTER TABLE public.agent_configs
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN role SET NOT NULL;

-- Seed the 4 system agents for any existing user that doesn't have them yet
INSERT INTO public.agent_configs (user_id, id, name, role, avatar_color, is_system, created_by, env, model, prompt, tools, subagents, voices, personality)
SELECT u.id, seed.id, seed.name, seed.role, seed.avatar_color, true, 'system', 'prod', seed.model, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb
FROM auth.users u
CROSS JOIN (VALUES
  ('luca',     'Luca',     'orchestrator', 'cream',   'anthropic/claude-sonnet-4-20250514'),
  ('vektor',   'Vektor',   'analyst',      'blue',    'anthropic/claude-sonnet-4-20250514'),
  ('anima',    'Anima',    'empath',       'magenta', 'anthropic/claude-sonnet-4-20250514'),
  ('observer', 'Observer', 'guardian',     'ochre',   'anthropic/claude-haiku-4-5')
) AS seed(id, name, role, avatar_color, model)
ON CONFLICT (user_id, id) DO NOTHING;

-- Trigger: seed system agents on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_agents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agent_configs (user_id, id, name, role, avatar_color, is_system, created_by, env, model, prompt, tools, subagents, voices, personality)
  VALUES
    (NEW.id, 'luca',     'Luca',     'orchestrator', 'cream',   true, 'system', 'prod', 'anthropic/claude-sonnet-4-20250514', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb),
    (NEW.id, 'vektor',   'Vektor',   'analyst',      'blue',    true, 'system', 'prod', 'anthropic/claude-sonnet-4-20250514', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb),
    (NEW.id, 'anima',    'Anima',    'empath',       'magenta', true, 'system', 'prod', 'anthropic/claude-sonnet-4-20250514', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb),
    (NEW.id, 'observer', 'Observer', 'guardian',     'ochre',   true, 'system', 'prod', 'anthropic/claude-haiku-4-5',         '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb)
  ON CONFLICT (user_id, id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_agents ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_agents
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_agents();