import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useToast } from '@/hooks/use-toast';
import { Pill } from '@/components/ui/luca';
import CreateAgentModal from '@/components/settings/CreateAgentModal';
import { ConfirmDialog } from '@/components/settings/FormControls';
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

  useEffect(() => {
    if (!user) return;
    load(user.id);
  }, [user, load]);

  const target = confirmDeleteId ? agents.find((a) => a.id === confirmDeleteId) : null;

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const res = await deleteAgent(id);
    if (res.ok) {
      toast({ title: 'Agent deleted' });
    } else {
      toast({ title: 'Could not delete', description: res.error, variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ padding: '24px 32px 48px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 className="cp-page-title" style={{ margin: 0 }}>Agents</h1>
        <Pill variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          + New agent
        </Pill>
      </div>

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
              <span className="agent-identity-dot" style={{ background: resolveAgentColor(a.avatar_color) }} aria-hidden="true" />
              <div>
                <div className="agent-identity-name">{a.name}</div>
                <span className="agent-identity-role">{a.role}</span>
              </div>
            </div>
            <span className="agent-model">{a.model.split('/').pop() ?? a.model}</span>
            <span className="agent-status">
              <span className={`agent-status-dot agent-status-dot--${a.status}`} aria-hidden="true" />
              <span className="agent-status-label">{a.is_system ? 'system' : a.created_by === 'luca' ? 'by luca' : 'custom'}</span>
            </span>
            <span className="agent-uptime">{a.env.toUpperCase()}</span>
            {a.is_system ? (
              <span className="agent-chev" aria-hidden="true">›</span>
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
                  color: 'var(--text-ghost)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '4px 8px',
                  borderRadius: 4,
                  transition: 'color var(--dur-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#f87171';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-ghost)';
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {agents.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>
            Loading agents…
          </div>
        )}
      </div>

      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {target && (
        <ConfirmDialog
          title={`Delete ${target.name}?`}
          message="This permanently removes the agent and its configuration. Conversations bound to this agent will fall back to Luca."
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
