/**
 * useMemoryRealtime — subscribes to live engram + connection changes for the
 * current user and merges them into the memory store. The graph reacts
 * immediately, with no layout reset — new nodes spawn in a deterministic
 * orbit and ease into place via the running force simulation.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeEngramRow, useMemoryStore, type Connection } from '@/stores/memoryStore';

export function useMemoryRealtime(userId: string | undefined, agentId = 'luca') {
  const upsertEngram = useMemoryStore((s) => s.upsertEngram);
  const removeEngram = useMemoryStore((s) => s.removeEngram);
  const upsertConnection = useMemoryStore((s) => s.upsertConnection);
  const removeConnection = useMemoryStore((s) => s.removeConnection);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`mnemos-graph-${userId}-${agentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'engrams', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string; agent_id?: string | null };
            if ((oldRow.agent_id || 'luca') !== agentId) return;
            const id = oldRow.id;
            if (id) removeEngram(id);
          } else {
            const row = normalizeEngramRow(payload.new as Record<string, unknown>);
            if (row.agent_id !== agentId) return;
            if (row?.id) upsertEngram(row);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connections', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string; agent_id?: string | null };
            if ((oldRow.agent_id || 'luca') !== agentId) return;
            const id = oldRow.id;
            if (id) removeConnection(id);
          } else {
            const row = payload.new as Connection;
            if ((row.agent_id || 'luca') !== agentId) return;
            if (row?.id) upsertConnection(row);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, agentId, upsertEngram, removeEngram, upsertConnection, removeConnection]);
}
