-- Import Overhaul Migration
-- Adds staleness/confirmation columns to memories, companion_profiles table,
-- and extends memory_conflicts for full conflict resolution

-- ═══════════════════════════════════════════════════════
-- Phase 1: Import provenance extensions on memories
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS staleness_risk TEXT
  CHECK (staleness_risk IN ('low', 'medium', 'high'));

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS estimated_date TEXT;

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS import_needs_confirmation BOOLEAN DEFAULT FALSE;

ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS user_confirmed BOOLEAN;

-- Index for unconfirmed imports (used by review UI and chat exclusion)
CREATE INDEX IF NOT EXISTS idx_memories_needs_confirmation
  ON public.memories(user_id) WHERE import_needs_confirmation = TRUE;

-- ═══════════════════════════════════════════════════════
-- Phase 2: Companion profiles table
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.companion_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  source_platform TEXT NOT NULL DEFAULT 'chatgpt',
  linguistic_fingerprint JSONB NOT NULL DEFAULT '{}',
  psychological_profile JSONB NOT NULL DEFAULT '{}',
  companion_summary TEXT,
  system_prompt_fragment TEXT,
  behavioral_rules JSONB DEFAULT '[]',
  conversations_analyzed INT DEFAULT 0,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  extraction_model TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  user_approved BOOLEAN DEFAULT FALSE,
  user_adjustments JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.companion_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'companion_profiles' AND policyname = 'Users can manage own profiles'
  ) THEN
    CREATE POLICY "Users can manage own profiles" ON public.companion_profiles
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companion_user_active
  ON public.companion_profiles(user_id) WHERE is_active = TRUE;

-- ═══════════════════════════════════════════════════════
-- Phase 3: Extend memory_conflicts for full resolution
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.memory_conflicts ADD COLUMN IF NOT EXISTS user_choice TEXT
  CHECK (user_choice IN ('keep_new', 'keep_both', 'corrected', 'dismissed'));

ALTER TABLE public.memory_conflicts ADD COLUMN IF NOT EXISTS correction_memory_id UUID
  REFERENCES public.memories(id);

-- Update conflict_type CHECK to include import_conflict
-- (DROP + re-ADD since ALTER CHECK not supported)
ALTER TABLE public.memory_conflicts DROP CONSTRAINT IF EXISTS memory_conflicts_conflict_type_check;
ALTER TABLE public.memory_conflicts ADD CONSTRAINT memory_conflicts_conflict_type_check
  CHECK (conflict_type IN ('standard', 'import_conflict', 'contradiction', 'update', 'ambiguity'));

-- Update status CHECK to include auto_resolved
ALTER TABLE public.memory_conflicts DROP CONSTRAINT IF EXISTS memory_conflicts_status_check;
ALTER TABLE public.memory_conflicts ADD CONSTRAINT memory_conflicts_status_check
  CHECK (status IN ('unresolved', 'user_resolved', 'auto_resolved'));

-- Index for unresolved conflicts
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_unresolved
  ON public.memory_conflicts(user_id) WHERE status = 'unresolved';
