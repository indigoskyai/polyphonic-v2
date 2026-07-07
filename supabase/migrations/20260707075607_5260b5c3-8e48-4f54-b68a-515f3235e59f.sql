
-- Recreate service-role policies scoped TO service_role (not TO public with a role-string check)

-- agent_social_channel_credentials
DROP POLICY IF EXISTS "Service role manages agent social credentials" ON public.agent_social_channel_credentials;
CREATE POLICY "Service role manages agent social credentials"
  ON public.agent_social_channel_credentials
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- agent_social_channels
DROP POLICY IF EXISTS "Service role manages agent social channels" ON public.agent_social_channels;
CREATE POLICY "Service role manages agent social channels"
  ON public.agent_social_channels
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- agent_social_credit_ledger
DROP POLICY IF EXISTS "Service role manages agent social credit ledger" ON public.agent_social_credit_ledger;
CREATE POLICY "Service role manages agent social credit ledger"
  ON public.agent_social_credit_ledger
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- agent_social_oauth_states
DROP POLICY IF EXISTS "Service role manages agent social oauth states" ON public.agent_social_oauth_states;
CREATE POLICY "Service role manages agent social oauth states"
  ON public.agent_social_oauth_states
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- agent_social_posts
DROP POLICY IF EXISTS "Service role manages agent social posts" ON public.agent_social_posts;
CREATE POLICY "Service role manages agent social posts"
  ON public.agent_social_posts
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- mnemos_identity_snapshot
DROP POLICY IF EXISTS "Service role full access identity snapshot" ON public.mnemos_identity_snapshot;
CREATE POLICY "Service role full access identity snapshot"
  ON public.mnemos_identity_snapshot
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- research_evidence_cards
DROP POLICY IF EXISTS "Service role full access research evidence cards" ON public.research_evidence_cards;
CREATE POLICY "Service role full access research evidence cards"
  ON public.research_evidence_cards
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
