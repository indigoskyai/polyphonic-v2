-- Research Lab: user-owned evidence cards for reproducible scientific claims.
--
-- The raw Well tensors are intentionally not stored here. Cards persist the
-- claim, dataset pointer, access recipe, measurements, caveats, and metadata
-- needed to recreate an analysis or hand it to Luca's runtime.

CREATE TABLE IF NOT EXISTS public.research_evidence_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id text NOT NULL DEFAULT 'luca',
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  title text NOT NULL,
  question text NOT NULL,
  dataset_id text NOT NULL,
  dataset_label text NOT NULL,
  evidence_level text NOT NULL DEFAULT 'catalog-only',
  claim_boundary text NOT NULL,
  access_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  measurements jsonb NOT NULL DEFAULT '[]'::jsonb,
  caveats jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_access jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary text,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_evidence_cards_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT research_evidence_cards_question_not_blank CHECK (length(btrim(question)) > 0),
  CONSTRAINT research_evidence_cards_dataset_id_not_blank CHECK (length(btrim(dataset_id)) > 0),
  CONSTRAINT research_evidence_cards_evidence_level_check CHECK (
    evidence_level IN ('simulation-direct', 'simulation-proxy', 'catalog-only')
  ),
  CONSTRAINT research_evidence_cards_status_check CHECK (
    status IN ('draft', 'ready', 'validated', 'archived')
  ),
  CONSTRAINT research_evidence_cards_access_plan_array CHECK (jsonb_typeof(access_plan) = 'array'),
  CONSTRAINT research_evidence_cards_measurements_array CHECK (jsonb_typeof(measurements) = 'array'),
  CONSTRAINT research_evidence_cards_caveats_array CHECK (jsonb_typeof(caveats) = 'array'),
  CONSTRAINT research_evidence_cards_raw_access_object CHECK (jsonb_typeof(raw_access) = 'object'),
  CONSTRAINT research_evidence_cards_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE public.research_evidence_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can view own research evidence cards"
  ON public.research_evidence_cards FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can create own research evidence cards"
  ON public.research_evidence_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can update own research evidence cards"
  ON public.research_evidence_cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Users can delete own research evidence cards"
  ON public.research_evidence_cards FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Service role full access research evidence cards"
  ON public.research_evidence_cards FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.validate_research_evidence_card_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.threads t
    WHERE t.id = NEW.thread_id
      AND t.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Research evidence card thread must belong to card owner';
  END IF;

  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = NEW.project_id
      AND p.user_id = NEW.user_id
      AND p.archived = false
  ) THEN
    RAISE EXCEPTION 'Research evidence card project must belong to card owner';
  END IF;

  IF NEW.source_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = NEW.source_message_id
      AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Research evidence card source message must belong to card owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_research_evidence_card_scope ON public.research_evidence_cards;
CREATE TRIGGER validate_research_evidence_card_scope
  BEFORE INSERT OR UPDATE OF user_id, thread_id, project_id, source_message_id
  ON public.research_evidence_cards
  FOR EACH ROW EXECUTE FUNCTION public.validate_research_evidence_card_scope();

DROP TRIGGER IF EXISTS update_research_evidence_cards_updated_at ON public.research_evidence_cards;
CREATE TRIGGER update_research_evidence_cards_updated_at
  BEFORE UPDATE ON public.research_evidence_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS research_evidence_cards_user_recent_idx
  ON public.research_evidence_cards(user_id, archived, updated_at DESC);

CREATE INDEX IF NOT EXISTS research_evidence_cards_user_dataset_idx
  ON public.research_evidence_cards(user_id, dataset_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS research_evidence_cards_thread_idx
  ON public.research_evidence_cards(thread_id, updated_at DESC)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS research_evidence_cards_project_idx
  ON public.research_evidence_cards(project_id, updated_at DESC)
  WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.research_evidence_cards IS 'User-owned Research Lab truth cards that persist reproducible evidence plans and results without storing raw scientific tensors.';
COMMENT ON COLUMN public.research_evidence_cards.raw_access IS 'Pointer-style access metadata such as HF dataset name, local cache command, split, source URLs, and no-raw-ingest flags.';
COMMENT ON FUNCTION public.validate_research_evidence_card_scope() IS 'Prevents evidence cards from linking to another user''s thread, project, or message.';
