import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Select } from '@/components/ui/luca';
import { useAuthStore } from '@/stores/authStore';
import {
  useAgentSettingsStore,
  type AgentConfig,
} from '@/stores/agentSettingsStore';
import EnvSwitcher from '@/components/settings/EnvSwitcher';
import PromptEditor from '@/components/settings/PromptEditor';
import ToolGrid from '@/components/settings/ToolGrid';
import McpList from '@/components/settings/McpList';
import SubAgentList from '@/components/settings/SubAgentList';
import VoiceCardGrid from '@/components/settings/VoiceCardGrid';
import Keychain from '@/components/settings/Keychain';
import StickySaveFooter from '@/components/settings/StickySaveFooter';
import AgentPersonality from '@/components/settings/AgentPersonality';
import IdentityEditor from '@/components/identity/IdentityEditor';
import { Section, InlinePill } from '@/components/settings/Section';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
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

  const time = useClock();

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
      <div
        style={{
          padding: 48,
          color: 'var(--text-tertiary)',
          fontSize: 13,
          fontFamily: 'var(--font-sans)',
        }}
      >
        Loading agent…
      </div>
    );
  }

  const patch = (p: Partial<AgentConfig>) => setDraft(agent.id, p);

  const modelLabel = agent.model.split('/').pop() ?? agent.model;

  // ── Resident agents (Luca, Observer): read-only platform-controlled view.
  if (agent.locked) {
    return (
      <SettingsPage
        folio={{
          left: (
            <>
              <span>
                <AgentDot color={resolveAgentColor(agent.avatar_color)} />{' '}
                {agent.name.toLowerCase()}
              </span>
              <span>
                settings · agents · <span className="v">{agent.name.toLowerCase()}</span>
              </span>
            </>
          ),
          right: (
            <>
              <span>{modelLabel}</span>
              <span>{time}</span>
            </>
          ),
        }}
      >
        <div className="set-head">
          <button
            type="button"
            onClick={() => navigate('/settings/agents')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              padding: 0,
              marginBottom: 16,
            }}
          >
            ← Agents
          </button>
          <div className="set-head-eye">
            <span className="num">§ 09 / 01 · agent</span>
            <span>·</span>
            <span className="v">{agent.role}</span>
            <InlinePill variant="amber">Resident · locked</InlinePill>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: resolveAgentColor(agent.avatar_color),
                boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              }}
              aria-hidden="true"
            />
            <h1 className="set-head-title" style={{ margin: 0 }}>
              {agent.name}
            </h1>
          </div>
          <p className="set-head-sub">
            {agent.id === 'luca'
              ? 'Luca is a resident agent of this platform — emotionally intuitive, radically honest, transparent. Her identity is owned by the platform and cannot be edited. She is always available in the composer.'
              : 'The Observer is a resident agent of this platform. It silently watches every conversation and maintains running notes about patterns, concerns, and welfare signals. Open the Observer drawer from any thread to see what it has noted, or to ask it a direct question.'}
          </p>
        </div>

        <div className="set-body">
          <Section
            number="01"
            name="Identity"
            title="Platform-controlled"
            desc="This agent's configuration is owned by the platform and cannot be changed."
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                rowGap: 12,
                columnGap: 16,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--text-soft)',
                  letterSpacing: 'var(--track-folio)',
                  textTransform: 'uppercase',
                }}
              >
                Model
              </span>
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  letterSpacing: 'var(--track-body-tight)',
                }}
              >
                {agent.model}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--text-soft)',
                  letterSpacing: 'var(--track-folio)',
                  textTransform: 'uppercase',
                }}
              >
                Role
              </span>
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  letterSpacing: 'var(--track-body-tight)',
                }}
              >
                {agent.role}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--text-soft)',
                  letterSpacing: 'var(--track-folio)',
                  textTransform: 'uppercase',
                }}
              >
                Status
              </span>
              <span
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  letterSpacing: 'var(--track-body-tight)',
                }}
              >
                Platform-controlled · locked
              </span>
            </div>
          </Section>
        </div>
      </SettingsPage>
    );
  }

  // ── Editable agent
  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot color={resolveAgentColor(agent.avatar_color)} />{' '}
              {agent.name.toLowerCase()}
            </span>
            <span>
              settings · agents ·{' '}
              <span className="v">{agent.name.toLowerCase()}</span>
            </span>
          </>
        ),
        right: (
          <>
            <span>{modelLabel}</span>
            <span>{agent.env}</span>
            <span>{time}</span>
          </>
        ),
      }}
      footer={<StickySaveFooter agentId={agent.id} />}
    >
      <div className="set-head">
        <button
          type="button"
          onClick={() => navigate('/settings/agents')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--track-folio)',
            textTransform: 'uppercase',
            padding: 0,
            marginBottom: 16,
          }}
        >
          ← Agents
        </button>
        <div className="set-head-eye">
          <span className="num">§ 09 / 01 · agent</span>
          <span>·</span>
          <span className="v">{agent.role}</span>
          {agent.is_system && <InlinePill variant="amber">System</InlinePill>}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: resolveAgentColor(agent.avatar_color),
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            }}
            aria-hidden="true"
          />
          {agent.is_system ? (
            <h1 className="set-head-title" style={{ margin: 0 }}>
              {agent.name}
            </h1>
          ) : (
            <input
              type="text"
              value={agent.name}
              onChange={(e) => patch({ name: e.target.value })}
              className="set-head-title"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--ink)',
                padding: 0,
                minWidth: 60,
                maxWidth: 480,
                margin: 0,
              }}
              placeholder="Agent name"
            />
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--text-soft)',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              marginRight: 4,
            }}
          >
            Environment
          </span>
          <EnvSwitcher value={agent.env} onChange={(env) => patch({ env })} />
        </div>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Reasoning"
          title="Model"
          desc="Which LLM handles this agent's turns."
        >
          <Select
            value={agent.model}
            onChange={(v) => patch({ model: v })}
            options={MODELS}
          />
        </Section>

        <Section
          number="02"
          name="System prompt"
          title="Identity & instructions"
          desc="Used verbatim at the top of every turn."
        >
          <PromptEditor value={agent.prompt} onChange={(v) => patch({ prompt: v })} />
        </Section>

        <Section
          number="03"
          name="Identity"
          title="Living identity documents"
          desc="SOUL, Convictions, User-model, Self-model — the layered identity files this agent reads from for continuity. Editable for user-created agents."
        >
          {user && (
            <IdentityEditor agentId={agent.id} userId={user.id} />
          )}
        </Section>

        <Section
          number="04"
          name="Personality"
          title="Voice & inner life"
          desc="Voice description, inner-life signals, and thought verbosity for this agent."
        >
          <AgentPersonality agentId={agent.id} />
        </Section>

        <Section
          number="05"
          name="Tools"
          title="Capabilities"
          desc="Enable capabilities. Gated tools will ask for confirmation before running."
          pill={<InlinePill variant="amber">Coming soon</InlinePill>}
        >
          <ComingSoonShade>
            <ToolGrid tools={agent.tools} onChange={(tools) => patch({ tools })} />
          </ComingSoonShade>
        </Section>

        <Section
          number="06"
          name="MCP servers"
          title="External context sources"
          desc="External context sources attached to this agent."
          pill={<InlinePill variant="amber">Coming soon</InlinePill>}
        >
          <ComingSoonShade>
            <McpList servers={agent.mcp} />
          </ComingSoonShade>
        </Section>

        <Section
          number="07"
          name="Sub-agents"
          title="Dedicated helpers"
          desc="Dedicated helpers spawned under this orchestrator."
          pill={<InlinePill variant="amber">Coming soon</InlinePill>}
        >
          <ComingSoonShade>
            <SubAgentList
              subagents={agent.subagents}
              onChange={(subagents) => patch({ subagents })}
            />
          </ComingSoonShade>
        </Section>

        <Section
          number="08"
          name="Voice"
          title="Spoken response"
          desc="TTS configuration for spoken responses."
          pill={<InlinePill variant="amber">Coming soon</InlinePill>}
        >
          <ComingSoonShade>
            <VoiceCardGrid voices={agent.voices} agentId={agent.id} />
          </ComingSoonShade>
        </Section>

        <Section
          number="09"
          name="Keychain"
          title="Provider keys"
          desc="Provider API keys. Only the last three characters are shown."
          pill={<InlinePill variant="amber">Coming soon</InlinePill>}
        >
          <ComingSoonShade>
            <Keychain secrets={agent.secrets} />
          </ComingSoonShade>
        </Section>
      </div>
    </SettingsPage>
  );
}
