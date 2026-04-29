ALTER TABLE public.user_settings
  ALTER COLUMN multi_model_enabled SET DEFAULT false;

UPDATE public.user_settings
   SET multi_model_enabled = false
 WHERE multi_model_enabled IS NULL
    OR multi_model_enabled = true;