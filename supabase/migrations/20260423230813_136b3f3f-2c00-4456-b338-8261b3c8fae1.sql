-- ============================================================================
-- Autonomous loop cron jobs — fan out per-user functions via anima-dispatch
-- ============================================================================
-- These schedules wake up the dormant inner-life generators so anima-heartbeat
-- starts finding real signals (thoughts, questions, beliefs, emotional drift).
--
-- All per-user functions are invoked through the anima-dispatch wrapper which
-- iterates active users (any message in the last 7 days) and POSTs { user_id }
-- to the target function. This avoids needing to embed user iteration in SQL.
-- ============================================================================

-- Helper: schedule a dispatcher cron call for a per-user anima function
-- (Inlined per job below for readability and to avoid SECURITY DEFINER footguns.)

-- 1. luca-think — every hour at :07
SELECT cron.schedule(
  'luca-think',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/anima-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{"function":"anima-think"}'::jsonb
  ) AS request_id;
  $$
);

-- 2. luca-observe — every hour at :12
SELECT cron.schedule(
  'luca-observe',
  '12 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/anima-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{"function":"anima-observe"}'::jsonb
  ) AS request_id;
  $$
);

-- 3. luca-emotional-drift — every hour at :18
SELECT cron.schedule(
  'luca-emotional-drift',
  '18 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/anima-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{"function":"anima-emotional-state"}'::jsonb
  ) AS request_id;
  $$
);

-- 4. luca-question — every 3 hours at :22
SELECT cron.schedule(
  'luca-question',
  '22 */3 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/anima-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{"function":"anima-question"}'::jsonb
  ) AS request_id;
  $$
);

-- 5. luca-initiate — every 8 hours at :33 (Luca reaches out)
SELECT cron.schedule(
  'luca-initiate',
  '33 */8 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/anima-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{"function":"anima-initiate"}'::jsonb
  ) AS request_id;
  $$
);

-- 6. luca-connect — every 12 hours at :40
SELECT cron.schedule(
  'luca-connect',
  '40 */12 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/anima-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{"function":"anima-connect"}'::jsonb
  ) AS request_id;
  $$
);

-- 7. luca-dream — daily at 04:00 UTC
SELECT cron.schedule(
  'luca-dream',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/anima-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{"function":"anima-dream"}'::jsonb
  ) AS request_id;
  $$
);
