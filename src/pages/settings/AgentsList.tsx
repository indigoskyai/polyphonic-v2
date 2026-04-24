import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';

function agentDotColor(id: string): string {
  switch (id) {
    case 'luca': return 'var(--luca-full)';
    case 'vektor': return 'var(--vektor-full)';
    case 'anima': return 'var(--anima-full)';
    default: return 'var(--text-tertiary)';
  }
}

export default function AgentsList() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const agents = useAgentSettingsStore((s) => s.agents);
  const load = useAgentSettingsStore((s) => s.load);

  useEffect(() => {
    if (!user) return;
    load(user.id);
  }, [user, load]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ padding: '24px 32px 48px' }}>
      <h1 className="cp-page-title" style={{ marginBottom: 24 }}>Agents</h1>
      <div>
        {agents.map((a) => (
          <button
            key={a.id}
            type="button"
            className="agent-row"
            onClick={() => navigate(`/settings/agents/${a.id}`)}
          >
            <div className="agent-identity">
              <span className="agent-identity-dot" style={{ background: agentDotColor(a.id) }} aria-hidden="true" />
              <div>
                <div className="agent-identity-name">{a.name}</div>
                <span className="agent-identity-role">{a.role}</span>
              </div>
            </div>
            <span className="agent-model">{a.model}</span>
            <span className="agent-status">
              <span className={`agent-status-dot agent-status-dot--${a.status}`} aria-hidden="true" />
              <span className="agent-status-label">{a.status}</span>
            </span>
            <span className="agent-uptime">{a.env.toUpperCase()}</span>
            <span className="agent-chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
