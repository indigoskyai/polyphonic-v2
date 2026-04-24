import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Select } from '@/components/ui/luca';
import { useAuthStore } from '@/stores/authStore';
import { useAgentSettingsStore, type AgentConfig } from '@/stores/agentSettingsStore';
import EnvSwitcher from '@/components/settings/EnvSwitcher';
import PromptEditor from '@/components/settings/PromptEditor';
import ToolGrid from '@/components/settings/ToolGrid';
import McpList from '@/components/settings/McpList';
import SubAgentList from '@/components/settings/SubAgentList';
import VoiceCardGrid from '@/components/settings/VoiceCardGrid';
import Keychain from '@/components/settings/Keychain';
import StickySaveFooter from '@/components/settings/StickySaveFooter';

const MODELS = [
  { value: 'opus-4-6', label: 'opus-4-6' },
  { value: 'sonnet-4-6', label: 'sonnet-4-6' },
  { value: 'haiku-4-5', label: 'haiku-4-5' },
];

function dotColor(id: string): string {
  switch (id) {
    case 'luca': return 'var(--luca-full)';
    case 'vektor': return 'var(--vektor-full)';
    case 'anima': return 'var(--anima-full)';
    default: return 'var(--text-tertiary)';
  }
}

export default function AgentDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const agents = useAgentSettingsStore((s) => s.agents);
  const load = useAgentSettingsStore((s) => s.load);
  const resolved = useAgentSettingsStore((s) => s.getResolved(id));
  const setDraft = useAgentSettingsStore((s) => s.setDraft);
  const isDirty = useAgentSettingsStore((s) => s.isDirty(id));

  useEffect(() => {
    if (!user) return;
    if (agents.length === 0) load(user.id);
  }, [user, agents.length, load]);

  // Block navigation when dirty
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  const agent = resolved;

  if (!agent) {
    return (
      <div style={{ padding: 48, color: 'var(--text-ghost)', fontSize: 13 }}>
        Loading agent…
      </div>
    );
  }

  const patch = (p: Partial<AgentConfig>) => setDraft(agent.id, p);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <header className="agent-detail-header">
        <button
          type="button"
          onClick={() => navigate('/settings/agents')}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, marginRight: 8 }}
        >
          ← Agents
        </button>
        <span className="agent-detail-dot" style={{ background: dotColor(agent.id) }} aria-hidden="true" />
        <h1 className="agent-detail-name">{agent.name}</h1>
        <span className="agent-role-pill">{agent.role}</span>
        <span className="agent-spacer" />
        <EnvSwitcher value={agent.env} onChange={(env) => patch({ env })} />
      </header>

      <div className="field-grid">
        <div className="field-label">Model
          <div className="field-hint">Which LLM handles this agent's turns.</div>
        </div>
        <div className="field-control">
          <Select value={agent.model} onChange={(v) => patch({ model: v })} options={MODELS} />
        </div>

        <div className="field-label">System prompt
          <div className="field-hint">Used verbatim at the top of every turn.</div>
        </div>
        <div className="field-control">
          <PromptEditor value={agent.prompt} onChange={(v) => patch({ prompt: v })} />
        </div>

        <div className="field-label">Tools
          <div className="field-hint">Enable capabilities. Gated tools will ask for confirmation before running.</div>
        </div>
        <div className="field-control">
          <ToolGrid tools={agent.tools} onChange={(tools) => patch({ tools })} />
        </div>

        <div className="field-label">MCP servers
          <div className="field-hint">External context sources attached to this agent.</div>
        </div>
        <div className="field-control">
          <McpList servers={agent.mcp} />
        </div>

        <div className="field-label">Sub-agents
          <div className="field-hint">Dedicated helpers spawned under this orchestrator.</div>
        </div>
        <div className="field-control">
          <SubAgentList subagents={agent.subagents} onChange={(subagents) => patch({ subagents })} />
        </div>

        <div className="field-label">Voice
          <div className="field-hint">TTS configuration for spoken responses.</div>
        </div>
        <div className="field-control">
          <VoiceCardGrid voices={agent.voices} agentId={agent.id} />
        </div>

        <div className="field-label">Keychain
          <div className="field-hint">Provider API keys. Only the last three characters are shown.</div>
        </div>
        <div className="field-control">
          <Keychain secrets={agent.secrets} />
        </div>
      </div>

      <StickySaveFooter agentId={agent.id} />
    </div>
  );
}
