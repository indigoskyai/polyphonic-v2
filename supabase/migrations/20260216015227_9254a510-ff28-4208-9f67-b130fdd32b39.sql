
-- Create message_variants table
CREATE TABLE public.message_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  content text NOT NULL,
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

-- Enable RLS
ALTER TABLE public.message_variants ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own variants"
ON public.message_variants FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own variants"
ON public.message_variants FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own variants"
ON public.message_variants FOR DELETE
USING (auth.uid() = user_id);
