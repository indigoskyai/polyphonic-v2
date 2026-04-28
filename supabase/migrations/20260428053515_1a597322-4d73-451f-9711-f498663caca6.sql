ALTER TABLE public.entity_activity_log
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'notable', 'important')),
  ADD COLUMN IF NOT EXISTS surface_to_user boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_activity_user_surface_created
  ON public.entity_activity_log (user_id, surface_to_user, created_at DESC)
  WHERE surface_to_user = true;

UPDATE public.entity_activity_log
   SET surface_to_user = true,
       severity = CASE
         WHEN activity_type IN ('initiation', 'belief_changed', 'belief_challenged',
                                'question_researched', 'dream', 'mood_shift') THEN 'notable'
         ELSE 'info'
       END
 WHERE surface_to_user = false
   AND activity_type NOT IN ('quiet_cycle', 'task_failed');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS quiet_hours_start smallint
    CHECK (quiet_hours_start IS NULL OR (quiet_hours_start BETWEEN 0 AND 23)),
  ADD COLUMN IF NOT EXISTS quiet_hours_end smallint
    CHECK (quiet_hours_end IS NULL OR (quiet_hours_end BETWEEN 0 AND 23)),
  ADD COLUMN IF NOT EXISTS quiet_hours_tz text DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS agent_status text NOT NULL DEFAULT 'idle'
    CHECK (agent_status IN ('idle', 'thinking', 'reading', 'searching', 'dreaming', 'reflecting')),
  ADD COLUMN IF NOT EXISTS push_subscription jsonb,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"in_app": true, "push": false, "email_digest": false}'::jsonb;

CREATE OR REPLACE FUNCTION public.mark_activity_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET last_seen_activity_at = now()
   WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_activity_seen() TO authenticated;