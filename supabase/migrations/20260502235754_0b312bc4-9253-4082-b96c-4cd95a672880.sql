
-- =========================================================================
-- Phase 4 — Data Integrity
-- =========================================================================

-- 1) Foreign keys to auth.users (ON DELETE CASCADE) for tables missing them.
--    Skip tables we can't safely cascade (chat_imports — may need preservation).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'threads','messages','user_api_keys','user_settings','memory_settings',
    'memories','memory_candidates','cognitive_state','observer_chat_messages',
    'observer_notes','observer_logs','thought_stream','thought_initiations',
    'emotional_history','emotional_state','daily_logs','daily_usage',
    'idempotency_keys','dashboard_widgets','agent_config','agent_configs',
    'agent_secrets','mcp_servers','memory_events','curiosity_questions',
    'activity_events','entity_activity_log','checkpoints','chat_imports',
    'profile_chats','profile_daily_pulse','psychological_profile'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- only add if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE cl.relname = t
        AND c.contype = 'f'
        AND c.conname = t || '_user_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID',
        t, t || '_user_id_fkey'
      );
      -- validate separately so existing orphans (if any) don't block migration
      BEGIN
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', t, t || '_user_id_fkey');
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Could not validate FK on %: %', t, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- 2) Hot-path indexes on messages
CREATE INDEX IF NOT EXISTS idx_messages_thread_created
  ON public.messages (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_created
  ON public.messages (user_id, created_at DESC);

-- 3) REPLICA IDENTITY FULL on realtime-published tables that need full row data
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.cognitive_state REPLICA IDENTITY FULL;
ALTER TABLE public.memory_candidates REPLICA IDENTITY FULL;
ALTER TABLE public.observer_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.observer_notes REPLICA IDENTITY FULL;
ALTER TABLE public.subagent_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.thought_stream REPLICA IDENTITY FULL;

-- 4) Move pg_trgm out of public schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, service_role, anon;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Update search_path for functions that depend on similarity()/% operators
ALTER FUNCTION public.match_engrams(text, integer, uuid) SET search_path = public, extensions;
ALTER FUNCTION public.match_memories(text, integer, uuid) SET search_path = public, extensions;
