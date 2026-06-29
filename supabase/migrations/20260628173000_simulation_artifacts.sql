-- Inline Simulation Turns: persist deterministic simulation artifacts and link
-- saved evidence cards back to the chat artifact that generated them.

ALTER TABLE public.artifacts
  DROP CONSTRAINT IF EXISTS artifacts_kind_check;

ALTER TABLE public.artifacts
  ADD CONSTRAINT artifacts_kind_check
  CHECK (kind IN ('html', 'react', 'svg', 'mermaid', 'markdown', 'simulation'));

ALTER TABLE public.research_evidence_cards
  ADD COLUMN IF NOT EXISTS artifact_id uuid REFERENCES public.artifacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS research_evidence_cards_artifact_idx
  ON public.research_evidence_cards(artifact_id)
  WHERE artifact_id IS NOT NULL;

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

  IF NEW.artifact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.artifacts a
    WHERE a.id = NEW.artifact_id
      AND a.user_id = NEW.user_id
      AND (NEW.thread_id IS NULL OR a.thread_id = NEW.thread_id)
  ) THEN
    RAISE EXCEPTION 'Research evidence card artifact must belong to card owner and thread';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_research_evidence_card_scope ON public.research_evidence_cards;
CREATE TRIGGER validate_research_evidence_card_scope
  BEFORE INSERT OR UPDATE OF user_id, thread_id, project_id, source_message_id, artifact_id
  ON public.research_evidence_cards
  FOR EACH ROW EXECUTE FUNCTION public.validate_research_evidence_card_scope();

COMMENT ON COLUMN public.research_evidence_cards.artifact_id IS 'Optional inline simulation artifact that generated or visualized this evidence card.';
