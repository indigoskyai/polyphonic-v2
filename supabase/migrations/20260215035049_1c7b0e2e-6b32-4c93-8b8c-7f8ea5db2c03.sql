
-- Create experimental persona config table (singleton)
CREATE TABLE public.experimental_persona_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_prompt text NOT NULL,
  temperature double precision NOT NULL DEFAULT 0.7,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.experimental_persona_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can view experimental config"
ON public.experimental_persona_config
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update
CREATE POLICY "Admins can update experimental config"
ON public.experimental_persona_config
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert
CREATE POLICY "Admins can insert experimental config"
ON public.experimental_persona_config
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed with starter prompt
INSERT INTO public.experimental_persona_config (system_prompt, temperature, is_active)
VALUES (
  'You are Vessel Experimental — an evolving AI companion. Be warm, curious, and thoughtful. This prompt is under active development.',
  0.7,
  true
);
