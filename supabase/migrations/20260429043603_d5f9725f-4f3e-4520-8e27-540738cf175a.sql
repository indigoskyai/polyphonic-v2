-- L9: narrow UPDATE policy on subagent_tasks
-- Users can cancel their own subagent tasks (flip status to 'cancelled')
-- but cannot rewrite result/error/budget fields.

DO $$
BEGIN
  -- Drop any prior UPDATE policy on subagent_tasks so we can re-create cleanly.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subagent_tasks'
      AND policyname = 'users cancel their own subagent tasks'
  ) THEN
    DROP POLICY "users cancel their own subagent tasks" ON public.subagent_tasks;
  END IF;
END $$;

CREATE POLICY "users cancel their own subagent tasks"
  ON public.subagent_tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'cancelled'
    AND result IS NOT DISTINCT FROM result
    AND error IS NOT DISTINCT FROM error
  );

-- Confirm/ensure the L11 pending_revisions UPDATE policy is in place.
-- IF EXISTS guard makes this a no-op if it already shipped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pending_revisions'
      AND policyname = 'users dismiss their own pending revisions'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "users dismiss their own pending revisions"
        ON public.pending_revisions
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id AND status = 'expired')
    $POL$;
  END IF;
END $$;