import { create } from 'zustand';

export interface AgentScope {
  id: string;
  name: string;
}

interface State {
  activeAgentId: string;
  availableAgents: AgentScope[];
  setActiveAgent: (id: string) => void;
}

// Only Luca exists today. Future agents will be appended here (or loaded from
// agent_configs) without changing the consuming UI.
export const useAgentScopeStore = create<State>((set) => ({
  activeAgentId: 'luca',
  availableAgents: [{ id: 'luca', name: 'Luca' }],
  setActiveAgent: (id) => set({ activeAgentId: id }),
}));
