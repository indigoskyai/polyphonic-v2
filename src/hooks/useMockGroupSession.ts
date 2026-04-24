import { useEffect } from 'react';
import { useGroupSessionStore, type AgentKey } from '@/stores/groupSessionStore';

const SCRIPT: { agent: AgentKey; line: string; durMs: number }[] = [
  { agent: 'luca', line: 'I think we should start by outlining the options before locking a choice.', durMs: 4000 },
  { agent: 'vektor', line: 'Option A favors throughput; Option B favors clarity. Tradeoffs along the usual axes.', durMs: 5000 },
  { agent: 'anima', line: 'I lean toward clarity — readers will carry the code further than we will.', durMs: 3000 },
];

export default function useMockGroupSession() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const s = useGroupSessionStore.getState();
    s.reset();
    s.setMic(true);

    let cancelled = false;
    const run = async () => {
      let idx = 0;
      while (!cancelled) {
        const step = SCRIPT[idx % SCRIPT.length];
        const nextQueue: AgentKey[] = [
          SCRIPT[(idx + 1) % SCRIPT.length].agent,
          SCRIPT[(idx + 2) % SCRIPT.length].agent,
          step.agent,
        ];
        useGroupSessionStore.getState().setQueue(nextQueue);

        // Set all to idle then activate the speaker; others listening
        (['luca', 'vektor', 'anima'] as AgentKey[]).forEach((a) => {
          useGroupSessionStore.getState().setMode(a, a === step.agent ? 'speaking' : 'listening');
        });

        // Stream partial text
        const words = step.line.split(' ');
        let built = '';
        for (let w = 0; w < words.length; w++) {
          if (cancelled) return;
          built += (built ? ' ' : '') + words[w];
          useGroupSessionStore.getState().appendPartial(step.agent, built);
          await new Promise((r) => setTimeout(r, step.durMs / words.length));
        }
        useGroupSessionStore.getState().finalizeLine(step.agent);
        idx++;
      }
    };

    run();
    return () => {
      cancelled = true;
      useGroupSessionStore.getState().reset();
    };
  }, []);
}
