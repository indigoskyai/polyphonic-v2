-- Add enriched memory columns for multi-agent pipeline
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS emotional_intensity float DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS detail_level text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS topic_frequency integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS narrative_thread text;

-- Add pipeline stage tracking to chat_imports
ALTER TABLE public.chat_imports
  ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'queued';