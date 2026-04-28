-- Phase L3: dialectic patch audit trail and pending revision capture.

CREATE TABLE IF NOT EXISTS public.agent_identity_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL DEFAULT 'luca',
  doc_type text NOT NULL CHECK (doc_type IN ('soul', 'self_model', 'user_model')),
  section text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('append', 'refine', 'retire')),
  patch_content text NOT NULL,
  rationale text,
  source_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  source_message_ids uuid[] DEFAULT '{}',
  confidence numeric(3,2) NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'queued', 'rejected')),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_identity_patches_user_created_idx
  ON public.agent_identity_patches (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_identity_patches_source_thread_idx
  ON public.agent_identity_patches (source_thread_id, created_at DESC);

ALTER TABLE public.agent_identity_patches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read their own patches" ON public.agent_identity_patches;
CREATE POLICY "users read their own patches"
  ON public.agent_identity_patches FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.pending_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  revision_type text NOT NULL CHECK (revision_type IN ('correction', 'reconsideration', 'new_thought', 'disagreement')),
  what_was_said text NOT NULL,
  what_to_say_now text NOT NULL,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  surfaced_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'surfaced', 'applied', 'expired'))
);

CREATE INDEX IF NOT EXISTS pending_revisions_active_idx
  ON public.pending_revisions (thread_id, status, created_at);

ALTER TABLE public.pending_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read their own revisions" ON public.pending_revisions;
CREATE POLICY "users read their own revisions"
  ON public.pending_revisions FOR SELECT
  USING (auth.uid() = user_id);
