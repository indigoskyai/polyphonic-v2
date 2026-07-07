CREATE TABLE IF NOT EXISTS public.continuity_turn_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE CASCADE,
  user_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  assistant_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  agent_id text NOT NULL DEFAULT 'luca',
  model text,
  runtime_mode text,
  status text NOT NULL DEFAULT 'captured'
    CHECK (status IN ('captured', 'updated', 'partial', 'failed')),
  context_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  write_summary jsonb NOT NULL DEFAULT '{"operations":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS continuity_turn_traces_assistant_message_uidx
  ON public.continuity_turn_traces (assistant_message_id)
  WHERE assistant_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_continuity_turn_traces_user_thread_time
  ON public.continuity_turn_traces (user_id, thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_continuity_turn_traces_assistant_message
  ON public.continuity_turn_traces (assistant_message_id);

GRANT SELECT ON TABLE public.continuity_turn_traces TO authenticated;
GRANT ALL ON TABLE public.continuity_turn_traces TO service_role;

ALTER TABLE public.continuity_turn_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own continuity turn traces" ON public.continuity_turn_traces;
CREATE POLICY "Users can view own continuity turn traces"
  ON public.continuity_turn_traces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access continuity turn traces" ON public.continuity_turn_traces;
CREATE POLICY "Service role full access continuity turn traces"
  ON public.continuity_turn_traces FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_continuity_turn_traces_updated_at ON public.continuity_turn_traces;
CREATE TRIGGER update_continuity_turn_traces_updated_at
  BEFORE UPDATE ON public.continuity_turn_traces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.append_continuity_trace_write(
  p_trace_id uuid,
  p_operation jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.continuity_turn_traces
  SET
    write_summary = jsonb_set(
      COALESCE(write_summary, '{}'::jsonb),
      '{operations}',
      COALESCE(write_summary->'operations', '[]'::jsonb)
        || jsonb_build_array(COALESCE(p_operation, '{}'::jsonb)),
      true
    ),
    status = 'updated',
    updated_at = now()
  WHERE id = p_trace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_continuity_trace_write(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';