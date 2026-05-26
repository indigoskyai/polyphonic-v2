import { supabase } from '@/integrations/supabase/client';

/**
 * isFirstRun — returns true if the user has no threads, no messages, and
 * no display_name set yet. Used by `FirstRunGate` in App.tsx to decide
 * whether to route the user to onboarding.
 *
 * Uses `Promise.allSettled` so a transient failure on one of the three
 * checks doesn't bounce the user — the gate prefers a forgiving read on
 * the assumption that re-running the gate later will be cheap.
 */
export async function isFirstRun(userId: string): Promise<boolean> {
  const settled = await Promise.allSettled([
    supabase.from('threads').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('profiles').select('display_name').eq('user_id', userId).maybeSingle(),
  ]);

  const threadRes = settled[0].status === 'fulfilled' ? settled[0].value : null;
  const messageRes = settled[1].status === 'fulfilled' ? settled[1].value : null;
  const profileRes = settled[2].status === 'fulfilled' ? settled[2].value : null;

  const threadCount = threadRes?.count ?? 0;
  const messageCount = messageRes?.count ?? 0;
  const hasDisplayName = !!(profileRes?.data as { display_name?: string | null } | null)?.display_name;

  return threadCount === 0 && messageCount === 0 && !hasDisplayName;
}

/**
 * markOnboarded — upserts the user's profile row so `isFirstRun` returns
 * false on the next check. Now propagates errors instead of swallowing
 * them, so the Onboarding page can surface "couldn't save onboarding
 * state" to the user instead of navigating into a route guard that
 * bounces them right back.
 *
 * Tara reported (2026-05-10) being kicked back to the onboarding screen
 * with "Skip for now" briefly routing to /chat then bouncing back; "Begin"
 * doing nothing. The cause is exactly this silent-failure path — when
 * either the existence check or the insert/update failed, the profile
 * row never got the `display_name` placeholder, so `isFirstRun()` stayed
 * true and the gate routed the user back.
 */
export async function markOnboarded(userId: string, displayName?: string): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (displayName && displayName.trim()) patch.display_name = displayName.trim();

  const { data: existing, error: existsErr } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (existsErr) {
    throw new Error(`markOnboarded: profile existence check failed: ${existsErr.message}`);
  }

  if (existing) {
    const existingName = (existing as { display_name?: string | null }).display_name;
    if (Object.keys(patch).length === 0 && existingName?.trim()) return;
    // Ensure a profile row has at least a placeholder display_name so the
    // first-run check flips to false, without overwriting a real name.
    if (Object.keys(patch).length === 0) patch.display_name = 'Anon';
    const { error: updateErr } = await supabase.from('profiles').update(patch).eq('user_id', userId);
    if (updateErr) {
      throw new Error(`markOnboarded: profile update failed: ${updateErr.message}`);
    }
  } else {
    if (Object.keys(patch).length === 0) patch.display_name = 'Anon';
    const { error: insertErr } = await supabase.from('profiles').insert({ user_id: userId, ...patch });
    if (insertErr) {
      throw new Error(`markOnboarded: profile insert failed: ${insertErr.message}`);
    }
  }
}
