import { supabase } from '@/integrations/supabase/client';

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

export async function markOnboarded(userId: string, displayName?: string): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (displayName && displayName.trim()) patch.display_name = displayName.trim();
  // Upsert-style: ensure a profile row exists with at least a placeholder display_name
  if (Object.keys(patch).length === 0) patch.display_name = 'Anon';

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase.from('profiles').update(patch).eq('user_id', userId);
  } else {
    await supabase.from('profiles').insert({ user_id: userId, ...patch });
  }
}
