DO $$
DECLARE
  uid uuid := '14d16916-b17c-46da-9742-7ba43925c6f1';
  t text;
  tables text[] := ARRAY[
    'memories','memory_candidates','memory_events',
    'engrams','engram_archive','connections','beliefs','hypomnema_entry',
    'psychological_profile','cognitive_state','emotional_state','emotional_history',
    'mnemos_emotional_state','mnemos_digests','profile_daily_pulse',
    'thought_stream','thought_initiations','activity_events','entity_activity_log',
    'observer_notes','observer_logs','daily_logs',
    'curiosity_questions','pending_revisions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', t) USING uid;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      RAISE NOTICE 'skip %', t;
    END;
  END LOOP;
END $$;