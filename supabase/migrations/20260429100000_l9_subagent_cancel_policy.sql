-- Phase L9 (gap fix): let users cancel their own running/pending subagents.
--
-- The L9 base migration only granted SELECT on subagent_tasks. The Phase 09
-- visualization already has a Cancel button, but without an UPDATE policy
-- the click was a no-op against the DB. This adds a narrow UPDATE policy
-- that only admits status='cancelled' so users can stop a runaway subagent
-- without overwriting result/error/budget fields.

DROP POLICY IF EXISTS "users cancel their own subagent tasks" ON public.subagent_tasks;
CREATE POLICY "users cancel their own subagent tasks"
  ON public.subagent_tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');
