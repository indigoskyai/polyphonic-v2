-- Migration 1: cron consolidation through invoke_edge_function helper
DO $$
DECLARE
  jobs TEXT[] := ARRAY['luca-think','luca-observe','luca-emotional-drift','luca-question','luca-initiate','luca-connect','luca-dream'];
  jn TEXT;
BEGIN
  FOREACH jn IN ARRAY jobs LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE cron.job.jobname = jn) THEN
      PERFORM cron.unschedule(jn);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule('luca-think','7 * * * *',$$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-think"}'::jsonb)$$);
SELECT cron.schedule('luca-observe','12 * * * *',$$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-observe"}'::jsonb)$$);
SELECT cron.schedule('luca-emotional-drift','18 * * * *',$$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-emotional-state"}'::jsonb)$$);
SELECT cron.schedule('luca-question','22 */3 * * *',$$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-question"}'::jsonb)$$);
SELECT cron.schedule('luca-initiate','33 */8 * * *',$$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-initiate"}'::jsonb)$$);
SELECT cron.schedule('luca-connect','40 */12 * * *',$$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-connect"}'::jsonb)$$);
SELECT cron.schedule('luca-dream','0 4 * * *',$$SELECT invoke_edge_function('anima-dispatch', '{"function":"anima-dream"}'::jsonb)$$);

-- Migration 2: client_error_log table + RLS
CREATE TABLE IF NOT EXISTS public.client_error_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  level       text        NOT NULL    DEFAULT 'error' CHECK (level IN ('error','warning','info')),
  source      text        NOT NULL    CHECK (source IN ('react','window','promise','manual')),
  message     text        NOT NULL,
  stack       text,
  context     jsonb       NOT NULL    DEFAULT '{}'::jsonb,
  request_id  text
);

CREATE INDEX IF NOT EXISTS client_error_log_created_at_idx ON public.client_error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS client_error_log_user_created_idx ON public.client_error_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_error_log_request_id_idx ON public.client_error_log (request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS client_error_log_request_id_unique ON public.client_error_log (request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_error_log_insert_any" ON public.client_error_log;
CREATE POLICY "client_error_log_insert_any" ON public.client_error_log
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "client_error_log_select_service_role" ON public.client_error_log;
CREATE POLICY "client_error_log_select_service_role" ON public.client_error_log
  FOR SELECT TO service_role USING (true);

COMMENT ON TABLE public.client_error_log IS 'Captured client-side errors. INSERT-any, SELECT-service-role.';