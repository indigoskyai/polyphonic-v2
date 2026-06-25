CREATE OR REPLACE FUNCTION public.mnemos_run_belief_challenge_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort  uuid[] := public.mnemos_cohort();
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

CREATE OR REPLACE FUNCTION public.mnemos_run_rehearsal_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort uuid[] := public.mnemos_cohort();
  r        record;
  v_n      integer;
  v_total  integer := 0;
  v_scopes integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, agent_id FROM engrams
    WHERE user_id = ANY(v_cohort) AND state IN ('active','dormant','consolidating')
  LOOP
    v_n := public.mnemos_rehearse_scope(r.user_id, r.agent_id, 150, 0.25);
    v_total := v_total + v_n;
    v_scopes := v_scopes + 1;
  END LOOP;
  RETURN jsonb_build_object('ran_at', now(), 'scopes', v_scopes, 'rehearsed', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mnemos_run_belief_challenge_cohort() TO service_role;
GRANT EXECUTE ON FUNCTION public.mnemos_run_rehearsal_cohort() TO service_role;