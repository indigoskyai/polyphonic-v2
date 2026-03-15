
-- Add missing columns to memories table
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS staleness_risk text;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS import_needs_confirmation boolean DEFAULT false;
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS user_confirmed boolean;

-- Create companion_profiles table
CREATE TABLE public.companion_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text,
  source_platform text DEFAULT 'chatgpt',
  linguistic_fingerprint jsonb DEFAULT '{}',
  psychological_profile jsonb DEFAULT '{}',
  companion_summary text DEFAULT '',
  system_prompt_fragment text DEFAULT '',
  behavioral_rules text[] DEFAULT '{}',
  conversations_analyzed integer DEFAULT 0,
  date_range_start timestamptz,
  date_range_end timestamptz,
  extraction_model text DEFAULT '',
  is_active boolean DEFAULT true,
  user_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.companion_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own companion profiles" ON public.companion_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own companion profiles" ON public.companion_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own companion profiles" ON public.companion_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own companion profiles" ON public.companion_profiles FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all companion profiles" ON public.companion_profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_companion_profiles_updated_at BEFORE UPDATE ON public.companion_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
