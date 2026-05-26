import { supabase } from '@/integrations/supabase/client';
import type { InterfaceMode, OnboardingPreferences } from '@/lib/interfaceMode';

/**
 * isFirstRun — returns true if the user has not completed onboarding and
 * has no existing chat activity. Used by `FirstRunGate` in App.tsx to decide
 * whether to route the user to onboarding.
 *
 * OAuth signups create profile display names automatically, so display_name
 * is not a valid onboarding signal. The durable marker lives on user_settings.
 */
export async function isFirstRun(userId: string): Promise<boolean> {
  const settled = await Promise.allSettled([
    supabase.from('threads').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('user_settings').select('onboarding_completed_at').eq('user_id', userId).maybeSingle(),
  ]);

  const threadRes = settled[0].status === 'fulfilled' ? settled[0].value : null;
  const messageRes = settled[1].status === 'fulfilled' ? settled[1].value : null;
  const settingsRes = settled[2].status === 'fulfilled' ? settled[2].value : null;

  const activityCheckFailed =
    settled[0].status === 'rejected'
    || settled[1].status === 'rejected'
    || Boolean(threadRes?.error)
    || Boolean(messageRes?.error);

  // If the activity reads fail, do not trap a signed-in user in onboarding.
  // They can still re-enter with ?onboarding=1.
  if (activityCheckFailed) return false;

  const completedAt = (settingsRes?.data as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at;
  if (completedAt) return false;

  const threadCount = threadRes?.count ?? 0;
  const messageCount = messageRes?.count ?? 0;

  return threadCount === 0 && messageCount === 0;
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
function isMissingOnboardingColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42703' || /onboarding_completed_at|interface_mode|onboarding_preferences/i.test(error.message || '');
}

export async function markOnboarded(
  userId: string,
  displayName?: string,
  options: { interfaceMode?: InterfaceMode; preferences?: OnboardingPreferences } = {},
): Promise<void> {
  const settingsPatch: Record<string, unknown> = {
    user_id: userId,
    onboarding_completed_at: new Date().toISOString(),
  };
  if (options.interfaceMode) settingsPatch.interface_mode = options.interfaceMode;
  if (options.preferences) settingsPatch.onboarding_preferences = options.preferences;

  const { error: settingsErr } = await supabase
    .from('user_settings')
    .upsert(settingsPatch, { onConflict: 'user_id' });

  if (settingsErr && !isMissingOnboardingColumn(settingsErr)) {
    throw new Error(`markOnboarded: settings update failed: ${settingsErr.message}`);
  }

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
