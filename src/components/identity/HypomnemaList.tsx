import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useHypomnemaStore } from '@/stores/hypomnemaStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import HypomnemaEntryCard from './HypomnemaEntry';

const AGENT_ORDER = ['luca', 'anima', 'vektor'];
const AGENT_LABEL: Record<string, string> = {
  luca: 'Luca',
  anima: 'Anima',
  vektor: 'Vektor',
};

export default function HypomnemaList() {
  const user = useAuthStore((s) => s.user);
  const entries = useHypomnemaStore((s) => s.entries);
  const loading = useHypomnemaStore((s) => s.loading);
  const load = useHypomnemaStore((s) => s.load);
  const subscribe = useHypomnemaStore((s) => s.subscribe);
  const forget = useHypomnemaStore((s) => s.forget);
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);

  useEffect(() => {
    if (!user) return;
    load(user.id);
    const unsub = subscribe(user.id);
    return () => { unsub(); };
  }, [user, load, subscribe]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const agent of AGENT_ORDER) map.set(agent, []);
    for (const entry of entries) {
      const arr = map.get(entry.agent_id) || [];
      arr.push(entry);
      map.set(entry.agent_id, arr);
    }
    return map;
  }, [entries]);

  const agentOrder = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const agent of AGENT_ORDER) {
      seen.add(agent);
      ordered.push(agent);
    }
    for (const agent of availableAgents) {
      if (!seen.has(agent.id)) {
        seen.add(agent.id);
        ordered.push(agent.id);
      }
    }
    for (const agent of grouped.keys()) {
      if (!seen.has(agent)) ordered.push(agent);
    }
    return ordered;
  }, [availableAgents, grouped]);

  const labelForAgent = (agentId: string) =>
    availableAgents.find((agent) => agent.id === agentId)?.name || AGENT_LABEL[agentId] || agentId;

  return (
    <section
      style={{
        borderTop: '1px solid var(--border-faint)',
        paddingTop: 36,
        marginTop: 24,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 'var(--track-mono)',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          § hypomnema
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 22,
            lineHeight: 1.2,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          What each agent is sitting with
        </h2>
        <p
          style={{
            color: 'var(--text-body)',
            fontSize: 13,
            lineHeight: 1.6,
            maxWidth: 660,
            margin: '8px 0 0',
          }}
        >
          Granular interior-state entries each agent carries about you — what they're holding right now, between sessions. Decays gently. The agent writes them in their own voice.
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-ghost)', fontSize: 13 }}>Loading hypomnema…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--text-ghost)', fontSize: 13, lineHeight: 1.6 }}>
          Nothing here yet. The first entries land after substantive turns.
        </p>
      ) : (
        agentOrder.map((agent) => {
          const list = grouped.get(agent) || [];
          if (list.length === 0) return null;
          return (
            <div key={agent} style={{ marginTop: 18 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: 'var(--track-mono)',
                  color: 'var(--text-ghost)',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                {labelForAgent(agent)} · {list.length}
              </div>
              {list.map((entry) => (
                <HypomnemaEntryCard
                  key={entry.id}
                  entry={entry}
                  onForget={(id) => forget(id).catch((err) => {
                    console.error('forget failed:', err);
                  })}
                />
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}
