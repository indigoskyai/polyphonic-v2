
-- 1. Fix bypassable service-role checks
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('engrams','engram_archive','beliefs','connections','mnemos_digests','mnemos_emotional_state')
      AND qual LIKE '%current_setting(''role''%'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Service role full access engrams" ON public.engrams
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access engram_archive" ON public.engram_archive
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access beliefs" ON public.beliefs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access connections" ON public.connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access mnemos_digests" ON public.mnemos_digests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access mnemos_emotional_state" ON public.mnemos_emotional_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Hide encrypted ciphertext column from authenticated users
REVOKE SELECT (encrypted_key) ON public.user_api_keys FROM authenticated, anon;

-- 3. Service role explicit policy on idempotency_keys (already bypasses RLS, but clarity)
DROP POLICY IF EXISTS "Service role full access idempotency_keys" ON public.idempotency_keys;
CREATE POLICY "Service role full access idempotency_keys" ON public.idempotency_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Storage policies
-- workspace-files INSERT/UPDATE
CREATE POLICY "users insert their own workspace files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-files'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND (auth.uid())::text = (storage.foldername(name))[2]
  );

CREATE POLICY "users update their own workspace files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'workspace-files'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND (auth.uid())::text = (storage.foldername(name))[2]
  )
  WITH CHECK (
    bucket_id = 'workspace-files'
    AND (storage.foldername(name))[1] = 'workspaces'
    AND (auth.uid())::text = (storage.foldername(name))[2]
  );

-- generated-images UPDATE/DELETE
CREATE POLICY "Users update own generated images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'generated-images' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'generated-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own generated images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generated-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 5. Realtime channel authorization — restrict subscriptions to topics scoped to the user
-- Topics must include the authenticated user's id (e.g. "user:<uuid>:thread:<id>").
-- postgres_changes use the underlying table RLS and are unaffected by this policy.
DROP POLICY IF EXISTS "Users subscribe to own scoped topics" ON realtime.messages;
CREATE POLICY "Users subscribe to own scoped topics"
  ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() LIKE '%' || auth.uid()::text || '%');

DROP POLICY IF EXISTS "Users broadcast to own scoped topics" ON realtime.messages;
CREATE POLICY "Users broadcast to own scoped topics"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() LIKE '%' || auth.uid()::text || '%');
