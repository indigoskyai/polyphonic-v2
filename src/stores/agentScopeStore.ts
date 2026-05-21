import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export interface AgentScope {
  id: string;
  name: string;
}

interface State {
  activeAgentId: string;
  availableAgents: AgentScope[];
  loading: boolean;
  load: (userId: string) => Promise<void>;
  setActiveAgent: (id: string) => void;
}

export const useAgentScopeStore = create<State>((set, get) => ({
  activeAgentId: 'luca',
  availableAgents: [{ id: 'luca', name: 'Luca' }],
  loading: false,
  load: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('agent_configs')
      .select('id, name, pending')
      .eq('user_id', userId)
      .eq('pending', false)
      .neq('id', 'observer')
      .order('name', { ascending: true });
    if (error) {
      console.warn('[agentScopeStore] load failed', error);
      set({ loading: false });
      return;
    }
    const seen = new Set<string>();
    const agents: AgentScope[] = [];
    for (const row of data ?? []) {
      const id = String(row.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      agents.push({ id, name: String(row.name || id) });
    }
    if (!seen.has('luca')) agents.unshift({ id: 'luca', name: 'Luca' });
    agents.sort((a, b) => (a.id === 'luca' ? -1 : b.id === 'luca' ? 1 : a.name.localeCompare(b.name)));
    const activeAgentId = agents.some((agent) => agent.id === get().activeAgentId)
      ? get().activeAgentId
      : 'luca';
    set({ availableAgents: agents, activeAgentId, loading: false });
  },
  setActiveAgent: (id) => set({ activeAgentId: id }),
}));
