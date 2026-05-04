-- Hypomnema layer — first-person interior-state memory layer
-- Per-agent, per-user. Always-loaded. Agent-authored at reflection time.
-- See docs/memory/PLAN.md section 2 for full design.

CREATE TABLE IF NOT EXISTS public.hypomnema_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL DEFAULT 'luca',

  -- Linkage to source
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,

  -- The entry itself
  content TEXT NOT NULL,
  density TEXT NOT NULL DEFAULT 'primary'
    CHECK (density IN ('primary', 'observer')),
  primary_in_thread BOOLEAN NOT NULL DEFAULT TRUE,

  -- Categorization (free-form, not enforced; common values: identity, relationship, work, mood, philosophy, meta)
  domain TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Confidence tracking (mirrors anima belief schema)
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.7
    CHECK (confidence >= 0 AND confidence <= 1),

  -- Temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_revised TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_challenged TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Revision history
  revision_count INT NOT NULL DEFAULT 0,
  revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- each entry: {old_confidence, new_confidence, reason, timestamp}

  -- Lifecycle
  active BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by UUID REFERENCES public.hypomnema_entry(id) ON DELETE SET NULL,

  -- Anti-decay flags
  foundational BOOLEAN NOT NULL DEFAULT FALSE,
  active_attention BOOLEAN NOT NULL DEFAULT TRUE,

  -- Provenance
  source TEXT NOT NULL DEFAULT 'reflection'
    CHECK (source IN ('reflection', 'observer', 'belief_challenge', 'onboarding')),

  -- Graduation tracking (Phase 6)
  graduated_to_engram_id UUID REFERENCES public.engrams(id) ON DELETE SET NULL,

  -- Embedding (Phase 4 — added in 20260505000002)
  -- placeholder column added now to avoid double-migration of vectors:
  -- (left as a no-op here; the embedding column is added in the next migration)

  -- Free-form metadata extension point
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS hypomnema_entry_active_idx
  ON public.hypomnema_entry(agent_id, user_id, active, last_revised DESC);

CREATE INDEX IF NOT EXISTS hypomnema_entry_thread_idx
  ON public.hypomnema_entry(thread_id) WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hypomnema_entry_challenge_idx
  ON public.hypomnema_entry(last_challenged ASC) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS hypomnema_entry_graduation_idx
  ON public.hypomnema_entry(user_id, agent_id, revision_count DESC, last_revised DESC)
  WHERE active = TRUE AND graduated_to_engram_id IS NULL;

CREATE INDEX IF NOT EXISTS hypomnema_entry_tags_idx
  ON public.hypomnema_entry USING GIN(tags);

-- Updated_at trigger (using existing helper from earlier migrations)
CREATE TRIGGER hypomnema_entry_touch
  BEFORE UPDATE ON public.hypomnema_entry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security
ALTER TABLE public.hypomnema_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_hypomnema"
  ON public.hypomnema_entry FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_hypomnema"
  ON public.hypomnema_entry FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_hypomnema"
  ON public.hypomnema_entry FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_hypomnema"
  ON public.hypomnema_entry FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime publication for frontend live-sync (matches memory_candidates pattern)
ALTER PUBLICATION supabase_realtime ADD TABLE public.hypomnema_entry;

-- Comment for schema documentation
COMMENT ON TABLE public.hypomnema_entry IS
  'Per-agent, per-user first-person interior-state entries. The "felt continuity" layer between Mnemos substrate and active conversation. Always-loaded into system prompt assembly. See docs/memory/PLAN.md.';

COMMENT ON COLUMN public.hypomnema_entry.density IS
  'primary: full first-person reflection by the agent who was primary in the source thread. observer: shorter peripheral note by an agent who participated but was not primary.';

COMMENT ON COLUMN public.hypomnema_entry.foundational IS
  'When TRUE, entry is immune to deep decay (salience floor 0.7). Set by belief-challenge cycle for sustained core entries.';

COMMENT ON COLUMN public.hypomnema_entry.graduated_to_engram_id IS
  'Set by mnemos-graduate cron when the entry is promoted to a Mnemos engram. Presence indicates the entry has crystallized into long-term substrate.';
