import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/settings/FormControls';
import { Section } from '@/components/settings/Section';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import { resolveAgentColor } from '@/lib/agentColors';

export default function AgentsList() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const agents = useAgentSettingsStore((s) => s.agents);
  const load = useAgentSettingsStore((s) => s.load);
  const deleteAgent = useAgentSettingsStore((s) => s.deleteAgent);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const time = useClock();

  useEffect(() => {
    if (!user) return;
    load(user.id);
  }, [user, load]);

  const target = confirmDeleteId
    ? agents.find((a) => a.id === confirmDeleteId)
    : null;

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const res = await deleteAgent(id);
    if (res.ok) {
      toast({ title: 'Agent deleted' });
    } else {
      toast({
        title: 'Could not delete',
        description: res.error,
        variant: 'destructive',
      });
    }
  };

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot /> luca
            </span>
            <span>
              settings · <span className="v">agents</span>
            </span>
            <span>
              {agents.length} agent{agents.length === 1 ? '' : 's'}
            </span>
          </>
        ),
        right: (
          <>
            <span>opus 4.7</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 09 / 01</span>
          <span>·</span>
          <span className="v">Resident & custom agents</span>
        </div>
        <h1 className="set-head-title">Agents</h1>
        <p className="set-head-sub">
          The three resident agents — Luca, Anima, Vektor — and any custom
          agents you've created. Click any row to configure model, prompt,
          tools, and personality.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name={`All agents · ${agents.length}`}
          title="Roster"
          desc="Resident agents are part of the core ensemble and cannot be deleted. Custom agents can be edited or removed at any time."
        >
          <div>
            {agents.map((a) => (
              <div
                key={a.id}
                className="agent-row"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/settings/agents/${a.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/settings/agents/${a.id}`);
                  }
                }}
              >
                <div className="agent-identity">
                  <span
                    className="agent-identity-dot"
                    style={{ background: resolveAgentColor(a.avatar_color) }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="agent-identity-name">{a.name}</div>
                    <span className="agent-identity-role">{a.role}</span>
                  </div>
                </div>
                <span className="agent-model">
                  {a.model.split('/').pop() ?? a.model}
                </span>
                <span className="agent-status">
                  <span
                    className={`agent-status-dot agent-status-dot--${a.status}`}
                    aria-hidden="true"
                  />
                  <span className="agent-status-label">
                    {a.locked
                      ? 'resident'
                      : a.is_system
                      ? 'system'
                      : a.created_by === 'luca'
                      ? 'by luca'
                      : 'custom'}
                  </span>
                </span>
                <span className="agent-uptime">{a.env.toUpperCase()}</span>
                {a.locked || a.is_system ? (
                  <span className="agent-chev" aria-hidden="true">
                    ›
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(a.id);
                    }}
                    aria-label={`Delete ${a.name}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: '4px 8px',
                      borderRadius: 4,
                      transition: 'color 180ms var(--ease-out)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color =
                        'var(--rose-accent, #c97c8a)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {agents.length === 0 && (
              <div
                style={{
                  padding: 48,
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Loading agents…
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 18,
              fontSize: 12,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans)',
              fontStyle: 'italic',
            }}
          >
            Custom agent creation is paused. Existing agents remain fully editable.
          </div>
        </Section>
      </div>



      {target && (
        <ConfirmDialog
          title={`Delete ${target.name}?`}
          message="This permanently removes the agent and its configuration. Conversations bound to this agent will fall back to Luca."
          confirmLabel="Delete agent"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </SettingsPage>
  );
}
