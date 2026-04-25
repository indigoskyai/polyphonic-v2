-- 1. Add locked column to agent_configs
ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

-- 2. Lock existing Luca + Observer rows
UPDATE public.agent_configs
  SET locked = true
  WHERE id IN ('luca', 'observer');

-- 3. Repoint any threads on retired agents to Luca
UPDATE public.threads
  SET agent_id = 'luca'
  WHERE agent_id IN ('vektor', 'anima');

-- 4. Delete dependent rows for retired agents, then the configs themselves
DELETE FROM public.agent_secrets WHERE agent_id IN ('vektor', 'anima');
DELETE FROM public.mcp_servers   WHERE agent_id IN ('vektor', 'anima');
DELETE FROM public.agent_configs WHERE id        IN ('vektor', 'anima');

-- 5. Replace seed trigger to only seed Luca + Observer (locked)
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
    (NEW.id, 'luca',     'Luca',     'orchestrator', 'cream', true, 'system', 'prod', 'anthropic/claude-sonnet-4',  '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb, true),
    (NEW.id, 'observer', 'Observer', 'guardian',     'ochre', true, 'system', 'prod', 'anthropic/claude-haiku-4.5', '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"inner_life": true, "thought_verbosity": 1, "voice_description": ""}'::jsonb, true)
  ON CONFLICT (user_id, id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 6. observer_notes table
CREATE TABLE IF NOT EXISTS public.observer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'note',
  content text NOT NULL,
  salience real NOT NULL DEFAULT 0.5,
  pinned boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS observer_notes_thread_idx ON public.observer_notes (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS observer_notes_user_idx   ON public.observer_notes (user_id, created_at DESC);
ALTER TABLE public.observer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access observer_notes"
  ON public.observer_notes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own observer notes"
  ON public.observer_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own observer notes"
  ON public.observer_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own observer notes"
  ON public.observer_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own observer notes"
  ON public.observer_notes FOR DELETE
  USING (auth.uid() = user_id);

-- 7. observer_chat_messages table
CREATE TABLE IF NOT EXISTS public.observer_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS observer_chat_thread_idx ON public.observer_chat_messages (thread_id, created_at);
ALTER TABLE public.observer_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access observer_chat_messages"
  ON public.observer_chat_messages FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own observer chat messages"
  ON public.observer_chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own observer chat messages"
  ON public.observer_chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own observer chat messages"
  ON public.observer_chat_messages FOR DELETE
  USING (auth.uid() = user_id);

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.observer_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.observer_chat_messages;