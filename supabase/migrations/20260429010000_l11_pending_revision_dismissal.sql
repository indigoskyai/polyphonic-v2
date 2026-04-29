-- Phase L11.b: let users dismiss their own pending revisions from the
-- /profile/revisions inspector. The existing RLS on pending_revisions only
-- granted SELECT; we need a narrow UPDATE that limits the user to setting
-- status to 'expired' so they can't fabricate or rewrite revision content.

DROP POLICY IF EXISTS "users dismiss their own revisions" ON public.pending_revisions;
CREATE POLICY "users dismiss their own revisions"
  ON public.pending_revisions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'expired');
