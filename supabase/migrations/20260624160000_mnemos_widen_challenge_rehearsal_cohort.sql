-- Mnemos · widen the belief-challenge + rehearsal nightly drivers from the
-- hardcoded 8-user dark-launch ring to the live cohort (all keyed users).
--
-- WHY: belief *synthesis* / auto-activation already widened to all keyed users —
-- public.mnemos_cohort() was redefined (20260623120000 / 20260624055232) to
-- `SELECT user_id FROM user_api_keys`. But these two nightly drivers kept their
-- inline ARRAY[...8 uuids...], so keyed users beyond the original 8 get beliefs
-- *created* but never *re-challenged*, and their engrams are never *rehearsed*.
-- The maturation loop must cover the same population that forms beliefs.
--
-- This repoints both drivers at public.mnemos_cohort(). Bodies are otherwise
-- byte-identical to the originals
-- (20260622150000_mnemos_belief_challenge_cron.sql,
--  20260622140000_mnemos_rehearsal.sql) — only the cohort SOURCE changes.
-- The cron schedules (04:50 challenge, 04:40 rehearse) call these functions by
-- name and are unchanged, so no re-scheduling is needed.
--
-- Side effect (intentional): the original ring included two keyless users
-- (twsherrard83, halliebkup). They drop out of both drivers now. For challenge
-- that is correct — anima-believe needs the user's own key and returned early
-- ("No API key") for them anyway. For rehearsal (pure-SQL, no key required) this
-- narrows coverage by two users; if we want rehearsal to cover ALL users with
-- engrams regardless of key, that is a separate, deliberate widening.

CREATE OR REPLACE FUNCTION public.mnemos_run_belief_challenge_cohort()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cohort  uuid[] := public.mnemos_cohort();  -- all keyed users (was a hardcoded 8)
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
  v_cohort uuid[] := public.mnemos_cohort();  -- all keyed users (was a hardcoded 8)
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
