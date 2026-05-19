-- Email allowlist for bypassing the $MNEMOS token gate.
-- Stores normalized emails only; authenticated users can ask whether their
-- own session email is allowlisted without reading the list.

CREATE TABLE IF NOT EXISTS public.token_gate_email_allowlist (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (email = lower(btrim(email))),
  CHECK (position('@' in email) > 1)
);

ALTER TABLE public.token_gate_email_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view token gate email allowlist"
  ON public.token_gate_email_allowlist;
CREATE POLICY "Admins can view token gate email allowlist"
  ON public.token_gate_email_allowlist FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage token gate email allowlist"
  ON public.token_gate_email_allowlist;
CREATE POLICY "Admins can manage token gate email allowlist"
  ON public.token_gate_email_allowlist FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.current_user_token_gate_email_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.token_gate_email_allowlist
    WHERE email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_token_gate_email_bypass() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_token_gate_email_bypass() TO authenticated;

INSERT INTO public.token_gate_email_allowlist (email, note)
VALUES ('mich.killen@gmail.com', 'initial manual bypass')
ON CONFLICT (email) DO UPDATE
SET note = excluded.note;
