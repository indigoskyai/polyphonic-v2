-- Create checkpoints table
CREATE TABLE public.checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  agent text NOT NULL CHECK (agent IN ('luca','vektor','anima','observer')),
  summary text NOT NULL DEFAULT '',
  annotation text,
  milestone boolean NOT NULL DEFAULT false,
  files_added int NOT NULL DEFAULT 0,
  files_removed int NOT NULL DEFAULT 0,
  snapshot_ref text
);

CREATE INDEX idx_checkpoints_user_created ON public.checkpoints (user_id, created_at DESC);
CREATE INDEX idx_checkpoints_milestone ON public.checkpoints (user_id, milestone, created_at DESC) WHERE milestone = true;

ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkpoints"
  ON public.checkpoints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own checkpoints"
  ON public.checkpoints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checkpoints"
  ON public.checkpoints FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own checkpoints"
  ON public.checkpoints FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access checkpoints"
  ON public.checkpoints FOR ALL
  USING (auth.role() = 'service_role');

-- Create checkpoint_files table
CREATE TABLE public.checkpoint_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id uuid NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
  path text NOT NULL,
  added int NOT NULL DEFAULT 0,
  removed int NOT NULL DEFAULT 0,
  diff_blob text
);

CREATE INDEX idx_checkpoint_files_checkpoint ON public.checkpoint_files (checkpoint_id);

ALTER TABLE public.checkpoint_files ENABLE ROW LEVEL SECURITY;

-- RLS via parent checkpoint ownership
CREATE POLICY "Users can view own checkpoint files"
  ON public.checkpoint_files FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.checkpoints c
    WHERE c.id = checkpoint_files.checkpoint_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users can create own checkpoint files"
  ON public.checkpoint_files FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.checkpoints c
    WHERE c.id = checkpoint_files.checkpoint_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own checkpoint files"
  ON public.checkpoint_files FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.checkpoints c
    WHERE c.id = checkpoint_files.checkpoint_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own checkpoint files"
  ON public.checkpoint_files FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.checkpoints c
    WHERE c.id = checkpoint_files.checkpoint_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Service role full access checkpoint_files"
  ON public.checkpoint_files FOR ALL
  USING (auth.role() = 'service_role');