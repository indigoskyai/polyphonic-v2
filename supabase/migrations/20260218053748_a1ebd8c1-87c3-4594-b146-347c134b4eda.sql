
-- Task 1.5: Add extraction_rejections table for rejection logging
CREATE TABLE public.extraction_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID,
  content TEXT NOT NULL,
  rejection_reason TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  memory_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup queries
CREATE INDEX idx_rejections_created ON public.extraction_rejections(created_at);

-- Enable RLS
ALTER TABLE public.extraction_rejections ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can view and insert their own rejections
CREATE POLICY "Users can view own rejections"
  ON public.extraction_rejections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rejections"
  ON public.extraction_rejections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Task 1.6: Add is_watchlist column to memories table
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS is_watchlist BOOLEAN DEFAULT FALSE;

-- Partial index for efficient retrieval of active, non-watchlist memories
CREATE INDEX idx_memories_active_non_watchlist ON public.memories(user_id, memory_type)
  WHERE NOT is_deleted AND NOT is_watchlist;
