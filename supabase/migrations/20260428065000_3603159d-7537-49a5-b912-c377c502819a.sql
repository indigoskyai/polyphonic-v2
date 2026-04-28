-- Phase L7: renderable artifacts created by Luca.

CREATE TABLE IF NOT EXISTS public.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('html', 'react', 'svg', 'mermaid', 'markdown')),
  title text,
  content text NOT NULL,
  parent_artifact_id uuid REFERENCES public.artifacts(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artifacts_thread_created_idx
  ON public.artifacts (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS artifacts_parent_version_idx
  ON public.artifacts (parent_artifact_id, version DESC);

ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users access their own artifacts" ON public.artifacts;
CREATE POLICY "users access their own artifacts"
  ON public.artifacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
