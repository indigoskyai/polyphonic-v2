ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS source_conversation_id uuid,
  ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS journal_entries_user_agent_source_idx
  ON public.journal_entries(user_id, agent_id, source_conversation_id, created_at DESC);

DO $$
DECLARE
  trigger_constraint_name text;
BEGIN
  FOR trigger_constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.journal_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%trigger_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS %I',
      trigger_constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_trigger_type_check
  CHECK (trigger_type IN ('periodic', 'post_conversation', 'post-conversation', 'spontaneous'));