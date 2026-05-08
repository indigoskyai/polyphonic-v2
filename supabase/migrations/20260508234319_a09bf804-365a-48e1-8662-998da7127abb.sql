DO $mig$
DECLARE
  t text;
  tables text[] := ARRAY[
    'activity_events','agent_config','agent_configs','agent_secrets','app_config',
    'chat_imports','checkpoint_files','checkpoints','cognitive_state','curiosity_questions',
    'daily_logs','dashboard_widgets','emotional_history','emotional_state','entity_activity_log',
    'journal_entries','mcp_servers','memories','memory_candidates','memory_events',
    'memory_settings','messages','observer_chat_messages','observer_logs','observer_notes',
    'openclaw_agents','openclaw_devices','openclaw_jobs','openclaw_pairing_codes','openclaw_relay_sessions',
    'profile_chat_messages','profile_chats','profile_daily_pulse','projects','psychological_profile',
    'thought_initiations','thought_stream','threads','user_settings'
  ];
  polname text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- The historic policy name pattern is "Service role full access <table>"
    -- except app_config which is just "Service role full access".
    IF t = 'app_config' THEN
      polname := 'Service role full access';
    ELSE
      polname := 'Service role full access ' || t;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', polname, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
      polname, t
    );
  END LOOP;
END
$mig$;

-- Drop the duplicate UPDATE policy on pending_revisions (two policies with
-- identical semantics existed; keep the one scoped to authenticated).
DROP POLICY IF EXISTS "users dismiss their own revisions" ON public.pending_revisions;

-- Document the intentional absence of user-facing IUD policies on user_api_keys.
COMMENT ON TABLE public.user_api_keys IS
  'API keys are write-only from the client via SECURITY DEFINER save_user_api_key() / delete_user_api_key(). No user-facing INSERT/UPDATE/DELETE policies are defined by design — all writes are gated by those functions, which enforce auth.uid() = user_id. Service role retains full access via the standard service-role policy. Linter WARN about missing policies is accepted.';
