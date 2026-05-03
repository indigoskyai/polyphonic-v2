// Realtime sync for agent_consultations scoped to the current chat thread.
//
// On thread mount: load the recent consultations for the thread into the
// store, then subscribe to INSERT/UPDATE on agent_consultations filtered by
// parent_thread_id so the drawer + chip update live as Luca consults Anima.

import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAgentConsultStore, type AgentConsultation } from '@/stores/agentConsultStore';

const HISTORY_LIMIT = 30;

export function useAgentConsultRealtime(threadId: string | null | undefined) {
  const hydrate = useAgentConsultStore((s) => s.hydrate);
  const upsert = useAgentConsultStore((s) => s.upsert);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('agent_consultations')
        .select(
          'id, parent_thread_id, parent_message_id, from_agent, to_agent, question, response, status, model_used, tokens_used, error, created_at, completed_at',
        )
        .eq('parent_thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (cancelled) return;
      if (error) {
        if (!error.message.toLowerCase().includes('agent_consultations')) {
          console.warn('useAgentConsultRealtime initial load failed:', error.message);
        }
        return;
      }
      hydrate(threadId, (data ?? []) as AgentConsultation[]);
    })();

    const channel = supabase
      .channel(`agent-consultations-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_consultations',
          filter: `parent_thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as AgentConsultation | undefined;
          if (!row?.id) return;
          upsert(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [threadId, hydrate, upsert]);
}
