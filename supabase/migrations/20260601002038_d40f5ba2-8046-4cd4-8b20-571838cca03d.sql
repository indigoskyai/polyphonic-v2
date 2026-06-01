ALTER TABLE public.chat_imports ADD COLUMN IF NOT EXISTS agent_id text;

UPDATE public.chat_imports
SET agent_id = 'luca'
WHERE agent_id IS NULL;

ALTER TABLE public.chat_imports ALTER COLUMN agent_id SET DEFAULT 'luca';
ALTER TABLE public.chat_imports ALTER COLUMN agent_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_imports_user_agent_created_idx
  ON public.chat_imports(user_id, agent_id, created_at DESC);

UPDATE public.engrams e
SET agent_id = e.source_context->>'agent_id'
WHERE e.agent_id = 'luca'
  AND e.source_context->>'type' = 'hypomnema_graduation'
  AND COALESCE(e.source_context->>'agent_id', '') NOT IN ('', 'luca', 'observer', 'guardian')
  AND EXISTS (
    SELECT 1
    FROM public.agent_configs ac
    WHERE ac.user_id = e.user_id
      AND ac.id = e.source_context->>'agent_id'
      AND COALESCE(ac.pending, false) = false
  );