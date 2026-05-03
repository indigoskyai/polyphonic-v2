-- Engram review fields
ALTER TABLE public.engrams
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_decision text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS digest_id uuid;

CREATE INDEX IF NOT EXISTS idx_engrams_user_unreviewed
  ON public.engrams (user_id, created_at DESC)
  WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_engrams_digest_id
  ON public.engrams (digest_id);

-- Daily digest table
CREATE TABLE IF NOT EXISTS public.mnemos_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  engram_count integer NOT NULL DEFAULT 0,
  reviewed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, digest_date)
);

ALTER TABLE public.mnemos_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own digests"
  ON public.mnemos_digests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access mnemos_digests"
  ON public.mnemos_digests FOR ALL
  USING (current_setting('role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_mnemos_digests_user_date
  ON public.mnemos_digests (user_id, digest_date DESC);

CREATE TRIGGER update_mnemos_digests_updated_at
  BEFORE UPDATE ON public.mnemos_digests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.mnemos_digests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mnemos_digests;