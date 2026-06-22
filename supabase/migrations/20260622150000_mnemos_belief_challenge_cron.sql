-- Mnemos Tier 2/3 · Phase 2c — dedicated belief-challenge cron.
--
-- The belief-challenge loop was structurally STARVED: anima-believe (which marks
-- stale beliefs stagnant and challenges them) is only invoked by anima-heartbeat,
-- which has a 2-action budget (MAX_ACTIONS) and runs belief-challenge at PRIORITY
-- 3 — behind curiosity (a 1,289-deep backlog) and salient thoughts. So the two
-- slots were almost always consumed before beliefs got a turn: in prod, beliefs
-- went stagnant=31 but challenged=0 after the Tier-1 deadlock/NULL fixes.
--
-- This decouples belief-challenge from heartbeat's budget by giving it its own
-- nightly cron that invokes anima-believe (action='challenge') per cohort scope.
-- anima-believe itself marks stagnant + challenges its top-3 stale beliefs per
-- call, so this drains the queue gradually. COHORT-GATED to the 8 power users for
-- dark-launch; bounded (~3 LLM challenges per scope per night).

CREATE OR REPLACE FUNCTION public.mnemos_run_belief_challenge_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort uuid[] := ARRAY[
    'cd557ff7-57ab-48c6-b5a3-a9432d1159ab', -- mistski
    '47299895-1796-4dbd-95a1-9b6f2fbe97eb', -- karen
    '2c1fd658-4a4f-4ee6-b2eb-88ba4a8019be', -- mich.killen
    '33d6d9f8-be8b-48f7-8899-33cc60939f82', -- Riley
    'a085f84f-8457-4274-bee4-f3f6b9c3d865', -- twsherrard83
    '26063e00-d5f1-48ef-a775-81979de987ac', -- gaiaskyarcanum
    '4413f702-d6b3-4680-bd51-42d9049785a3', -- aureliavespera694
    '2f5cf107-fc39-4283-99e0-5a3b2e60071e'  -- halliebkup
  ]::uuid[];
  r         record;
  v_invoked integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, agent_id FROM beliefs
    WHERE user_id = ANY(v_cohort) AND active = true
  LOOP
    PERFORM public.invoke_edge_function(
      'anima-believe',
      jsonb_build_object('user_id', r.user_id, 'agent_id', r.agent_id, 'action', 'challenge')
    );
    v_invoked := v_invoked + 1;
  END LOOP;
  RETURN jsonb_build_object('ran_at', now(), 'scopes_invoked', v_invoked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mnemos_run_belief_challenge_cohort() TO service_role;

-- nightly at 04:50 (after the rest of the morning chain; off-peak)
SELECT cron.unschedule('mnemos-belief-challenge')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mnemos-belief-challenge');
SELECT cron.schedule('mnemos-belief-challenge', '50 4 * * *',
  $$SELECT public.mnemos_run_belief_challenge_cohort()$$);
