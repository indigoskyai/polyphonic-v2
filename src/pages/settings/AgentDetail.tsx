import React, { useEffect } from 'react';
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
import AgentPersonality from '@/components/settings/AgentPersonality';
import { resolveAgentColor } from '@/lib/agentColors';

const MODELS = [
  { value: 'anthropic/claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { value: 'openai/gpt-5.5', label: 'GPT-5.5' },
  { value: 'openai/gpt-5.4', label: 'GPT-5.4' },
  { value: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'x-ai/grok-4.20', label: 'Grok 4.20' },
  { value: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { value: 'moonshotai/kimi-k2.6', label: 'Kimi K2.6' },
  { value: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5' },
];

function ComingSoonBadge() {
  return (
    <span
      style={{
        display: 'inline-block',
        marginLeft: 8,
        padding: '2px 8px',
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--track-meta)',
        color: 'var(--text-ghost)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        verticalAlign: 'middle',
      }}
    >
      Coming soon
    </span>
  );
}

function ComingSoonShade({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ opacity: 0.45, pointerEvents: 'none', userSelect: 'none' }}>
      {children}
    </div>
  );
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

  // Resident agents (Luca, Observer): read-only platform-controlled view.
  if (agent.locked) {
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
          <span className="agent-detail-dot" style={{ background: resolveAgentColor(agent.avatar_color) }} aria-hidden="true" />
          <h1 className="agent-detail-name">{agent.name}</h1>
          <span className="agent-role-pill">{agent.role}</span>
          <span
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--track-meta)',
              color: 'var(--text-ghost)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 999,
            }}
          >
            Resident · locked
          </span>
        </header>
        <div style={{ padding: '24px 32px 48px', maxWidth: 720 }}>
          <p style={{ color: 'var(--text-soft)', fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
            {agent.id === 'luca'
              ? "Luca is a resident agent of this platform — emotionally intuitive, radically honest, transparent. Her identity is owned by the platform and cannot be edited. She is always available in the composer."
              : "The Observer is a resident agent of this platform. It silently watches every conversation and maintains running notes about patterns, concerns, and welfare signals. Open the Observer drawer from any thread to see what it has noted, or to ask it a direct question."}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 8, columnGap: 16, fontSize: 12, color: 'var(--text-ghost)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)' }}>Model</span>
            <span style={{ color: 'var(--text-soft)' }}>{agent.model}</span>
            <span style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)' }}>Role</span>
            <span style={{ color: 'var(--text-soft)' }}>{agent.role}</span>
            <span style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)' }}>Status</span>
            <span style={{ color: 'var(--text-soft)' }}>Platform-controlled · locked</span>
          </div>
        </div>
      </div>
    );
  }

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
        <span className="agent-detail-dot" style={{ background: resolveAgentColor(agent.avatar_color) }} aria-hidden="true" />
        {agent.is_system ? (
          <h1 className="agent-detail-name">{agent.name}</h1>
        ) : (
          <input
            type="text"
            value={agent.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="agent-detail-name"
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              padding: 0,
              minWidth: 60,
              maxWidth: 280,
            }}
            placeholder="Agent name"
          />
        )}
        <span className="agent-role-pill">{agent.role}</span>
        {agent.is_system && (
          <span
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--track-meta)',
              color: 'var(--text-ghost)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 999,
            }}
          >
            System
          </span>
        )}
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

        <div className="field-label">Personality
          <div className="field-hint">Voice description, inner-life signals, and thought verbosity for this agent.</div>
        </div>
        <div className="field-control">
          <AgentPersonality agentId={agent.id} />
        </div>

        <div className="field-label">
          Tools<ComingSoonBadge />
          <div className="field-hint">Enable capabilities. Gated tools will ask for confirmation before running.</div>
        </div>
        <div className="field-control">
          <ComingSoonShade>
            <ToolGrid tools={agent.tools} onChange={(tools) => patch({ tools })} />
          </ComingSoonShade>
        </div>

        <div className="field-label">
          MCP servers<ComingSoonBadge />
          <div className="field-hint">External context sources attached to this agent.</div>
        </div>
        <div className="field-control">
          <ComingSoonShade>
            <McpList servers={agent.mcp} />
          </ComingSoonShade>
        </div>

        <div className="field-label">
          Sub-agents<ComingSoonBadge />
          <div className="field-hint">Dedicated helpers spawned under this orchestrator.</div>
        </div>
        <div className="field-control">
          <ComingSoonShade>
            <SubAgentList subagents={agent.subagents} onChange={(subagents) => patch({ subagents })} />
          </ComingSoonShade>
        </div>

        <div className="field-label">
          Voice<ComingSoonBadge />
          <div className="field-hint">TTS configuration for spoken responses.</div>
        </div>
        <div className="field-control">
          <ComingSoonShade>
            <VoiceCardGrid voices={agent.voices} agentId={agent.id} />
          </ComingSoonShade>
        </div>

        <div className="field-label">
          Keychain<ComingSoonBadge />
          <div className="field-hint">Provider API keys. Only the last three characters are shown.</div>
        </div>
        <div className="field-control">
          <ComingSoonShade>
            <Keychain secrets={agent.secrets} />
          </ComingSoonShade>
        </div>
      </div>

      <StickySaveFooter agentId={agent.id} />
    </div>
  );
}
