-- Recreate view with security_invoker so RLS on threads applies to the querying user
DROP VIEW IF EXISTS public.conversations;
CREATE VIEW public.conversations
WITH (security_invoker = true) AS
  SELECT id, user_id, title, created_at, updated_at FROM public.threads;