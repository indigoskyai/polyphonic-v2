// Phase L9: keep the SubAgent visualization store in sync with the
// `subagent_tasks` table for the current user. Reads the most recent
// pending/running/recently-completed tasks on mount, then subscribes to
// realtime INSERT/UPDATE events. Completed/failed agents auto-prune after a
// few minutes so the visualization doesn't accumulate forever.

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSubAgentStore, type SubAgentTaskRow } from '@/stores/subAgentStore';

const PRUNE_INTERVAL_MS = 60_000;
const HISTORY_LIMIT = 30;

export function useSubagentRealtime() {
  const userId = useAuthStore((s) => s.user?.id);
  const hydrate = useSubAgentStore((s) => s.hydrateRemoteTasks);
  const sync = useSubAgentStore((s) => s.syncRemoteTask);
  const prune = useSubAgentStore((s) => s.pruneStaleRemoteTasks);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('subagent_tasks')
        .select('id, parent_thread_id, agent_id, task_description, status, started_at, completed_at, progress')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (cancelled) return;
      if (error) {
        if (!error.message.toLowerCase().includes('subagent_tasks')) {
          console.warn('useSubagentRealtime initial load failed:', error.message);
        }
        return;
      }
      if (data && data.length > 0) {
        hydrate(data as unknown as SubAgentTaskRow[]);
      }
    })();

    const channel = supabase
      .channel(`subagent-tasks-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subagent_tasks', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new || payload.old) as SubAgentTaskRow | undefined;
          if (!row?.id) return;
          sync(row);
        },
      )
      .subscribe();

    const pruneTimer = window.setInterval(prune, PRUNE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pruneTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, hydrate, sync, prune]);
}
