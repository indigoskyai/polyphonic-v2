
-- Create chat_imports table for tracking import jobs
CREATE TABLE public.chat_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source_platform TEXT NOT NULL DEFAULT 'chatgpt',
  total_conversations INTEGER NOT NULL DEFAULT 0,
  processed_conversations INTEGER NOT NULL DEFAULT 0,
  memories_created INTEGER NOT NULL DEFAULT 0,
  questions_generated INTEGER NOT NULL DEFAULT 0,
  conflicts_detected INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_imports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own imports"
  ON public.chat_imports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own imports"
  ON public.chat_imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own imports"
  ON public.chat_imports FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role needs to update progress from edge function
-- (service role bypasses RLS by default)
