-- Phase L2: Luca's per-user identity documents.

CREATE TABLE IF NOT EXISTS public.agent_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  doc_type text NOT NULL CHECK (doc_type IN ('soul', 'self_model', 'user_model')),
  content text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id, doc_type)
);

CREATE INDEX IF NOT EXISTS agent_identity_user_agent_idx
  ON public.agent_identity (user_id, agent_id);

ALTER TABLE public.agent_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read their own identity docs" ON public.agent_identity;
CREATE POLICY "users read their own identity docs"
  ON public.agent_identity FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_agent_identity_updated_at ON public.agent_identity;
CREATE TRIGGER update_agent_identity_updated_at
  BEFORE UPDATE ON public.agent_identity
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
