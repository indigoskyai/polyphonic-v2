
-- Add memory_tier column to user_settings
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS memory_tier TEXT DEFAULT 'standard';

-- Validation trigger to restrict values
CREATE OR REPLACE FUNCTION public.validate_memory_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.memory_tier IS NOT NULL AND NEW.memory_tier NOT IN ('essential', 'standard', 'deep') THEN
    RAISE EXCEPTION 'memory_tier must be essential, standard, or deep';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_memory_tier_trigger
BEFORE INSERT OR UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.validate_memory_tier();
