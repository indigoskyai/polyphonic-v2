-- Remove the policy that exposes system prompts to all authenticated users
-- Edge functions use service role key so they don't need this policy
DROP POLICY IF EXISTS "Authenticated can read active prompts" ON public.system_prompts;

-- Also remove the equivalent for model_configs (same issue)
DROP POLICY IF EXISTS "Authenticated can read active configs" ON public.model_configs;