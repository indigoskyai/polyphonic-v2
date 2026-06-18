
-- email_send_log
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log"   ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role manages send log"
  ON public.email_send_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- email_send_state
DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role manages send state"
  ON public.email_send_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- email_unsubscribe_tokens
DROP POLICY IF EXISTS "Service role can insert tokens"         ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used"   ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens"           ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role manages unsubscribe tokens"
  ON public.email_unsubscribe_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- suppressed_emails
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails"   ON public.suppressed_emails;
CREATE POLICY "Service role manages suppressed emails"
  ON public.suppressed_emails FOR ALL TO service_role
  USING (true) WITH CHECK (true);
