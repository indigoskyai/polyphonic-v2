import { useEffect } from 'react';
import { useSubAgentStore } from '@/stores/subAgentStore';

/**
 * DEV-only hook. Spawns three mock sub-agents on mount, advances progress,
 * emits fake events, and completes one at 6s. Use only when
 * `import.meta.env.DEV` — no-ops in production builds.
 */
export default function useMockSubAgents(parentAgent = 'vektor') {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const { spawn, update, emit } = useSubAgentStore.getState();

    const v1 = spawn({ family: 'v1', parentAgent, task: 'indexing repo' });
    const v2 = spawn({ family: 'v2', parentAgent, task: 'scanning dependencies' });
    const v3 = spawn({ family: 'v3', parentAgent, task: 'computing summaries' });

    const ticks: number[] = [];
    const interval = window.setInterval(() => {
      const agents = useSubAgentStore.getState().agents;
      [v1, v2, v3].forEach((id) => {
        const a = agents[id];
        if (!a || a.state !== 'active') return;
        update(id, { progress: Math.min(0.99, a.progress + 0.08 + Math.random() * 0.04) });
      });
    }, 400);
    ticks.push(interval);

    const emitInterval = window.setInterval(() => {
      const agents = useSubAgentStore.getState().agents;
      const actives = [v1, v2, v3].filter((id) => agents[id]?.state === 'active');
      if (actives.length === 0) return;
      const pick = actives[Math.floor(Math.random() * actives.length)];
      const a = agents[pick];
      emit({
        agentId: pick,
        agentName: a.family,
        text: ['read file', 'parsed ast', 'matched pattern', 'emitted candidate'][Math.floor(Math.random() * 4)],
      });
    }, 900);
    ticks.push(emitInterval);

    const completeV2 = window.setTimeout(() => {
      update(v2, { state: 'complete', progress: 1 });
      emit({ agentId: v2, agentName: 'v2', text: 'complete' });
    }, 6000);
    ticks.push(completeV2);

    return () => {
      ticks.forEach((t) => window.clearTimeout(t));
      window.clearInterval(interval);
      window.clearInterval(emitInterval);
    };
  }, [parentAgent]);
}
