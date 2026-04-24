ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_check
  CHECK (kind IS NULL OR kind IN ('text', 'permission_request', 'agent_error'));

CREATE INDEX IF NOT EXISTS idx_messages_kind ON public.messages(kind) WHERE kind IS NOT NULL;