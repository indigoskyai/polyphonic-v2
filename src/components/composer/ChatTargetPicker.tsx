import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bot, ChevronDown, Ghost } from 'lucide-react';
import { useAgentSettingsStore, type AgentConfig } from '@/stores/agentSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { resolveAgentColor } from '@/lib/agentColors';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  getChatModelLabel,
  normalizeChatModelId,
  type ChatModelOption,
} from '@/lib/chatRuntime';

export type ChatTarget =
  | { kind: 'agent'; id: string }
  | { kind: 'model'; id: string };

interface ChatTargetPickerProps {
  activeTarget: ChatTarget;
  onSelectAgent: (agentId: string) => void;
  onSelectModel: (modelId: string) => void;
  variant?: 'composer' | 'header';
}

const LUCA_AGENT: Pick<AgentConfig, 'id' | 'name' | 'role' | 'avatar_color' | 'locked'> = {
  id: 'luca',
  name: 'Luca',
  role: 'resident',
  avatar_color: 'blue',
  locked: true,
};

const LAB_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  'x-ai': 'xAI',
  deepseek: 'DeepSeek',
  moonshotai: 'Moonshot',
  'meta-llama': 'Meta',
  qwen: 'Qwen',
};

const LAB_ORDER = ['anthropic', 'openai', 'google', 'x-ai', 'deepseek', 'moonshotai', 'meta-llama', 'qwen'];

function modelLab(modelId: string): string {
  return modelId.split('/')[0] || 'openrouter';
}

function groupModelsByLab() {
  const grouped = new Map<string, ChatModelOption[]>();
  for (const model of CHAT_MODEL_OPTIONS) {
    if (model.featured) continue;
    const lab = modelLab(model.id);
    grouped.set(lab, [...(grouped.get(lab) ?? []), model]);
  }
  return [
    ...LAB_ORDER.filter((lab) => grouped.has(lab)).map((lab) => [lab, grouped.get(lab)!] as const),
    ...[...grouped.entries()].filter(([lab]) => !LAB_ORDER.includes(lab)),
  ];
}

function featuredModels(): ChatModelOption[] {
  return CHAT_MODEL_OPTIONS.filter((m) => m.featured);
}

function normalizeAgentName(agent: Pick<AgentConfig, 'id' | 'name'> | undefined, fallbackId: string): string {
  if (agent?.name) return agent.name;
  if (fallbackId === 'luca') return 'Luca';
  return fallbackId;
}

export function ChatTargetPicker({
  activeTarget,
  onSelectAgent,
  onSelectModel,
  variant = 'composer',
}: ChatTargetPickerProps) {
  const user = useAuthStore((s) => s.user);
  const allAgents = useAgentSettingsStore((s) => s.agents);
  const loadAgents = useAgentSettingsStore((s) => s.load);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && allAgents.length === 0) void loadAgents(user.id);
  }, [allAgents.length, loadAgents, user]);

  const agents = useMemo(() => {
    const visible = allAgents.filter((agent) => agent.id !== 'observer' && agent.id !== 'guardian');
    if (visible.some((agent) => agent.id === 'luca')) return visible;
    return [LUCA_AGENT as AgentConfig, ...visible];
  }, [allAgents]);

  const modelGroups = useMemo(groupModelsByLab, []);
  const activeModelId = normalizeChatModelId(
    activeTarget.kind === 'model' ? activeTarget.id : DEFAULT_CHAT_MODEL,
  );
  const activeAgent = activeTarget.kind === 'agent'
    ? agents.find((agent) => agent.id === activeTarget.id)
    : undefined;
  const activeName = activeTarget.kind === 'agent'
    ? normalizeAgentName(activeAgent, activeTarget.id)
    : getChatModelLabel(activeModelId);
  const activeIconColor = activeTarget.kind === 'agent'
    ? (activeTarget.id === 'luca' ? 'var(--blue-accent)' : resolveAgentColor(activeAgent?.avatar_color))
    : 'var(--blue-accent)';

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuWidth = 316;
      const estimatedHeight = 420;
      const below = r.bottom + 8;
      const above = r.top - estimatedHeight - 8;
      const top = below + estimatedHeight > window.innerHeight - 8
        ? Math.max(8, above)
        : below;
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, r.left));
      setPos({ top, left });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sectionHeader = (label: string) => (
    <div
      key={`section-${label}`}
      style={{
        padding: '11px 10px 5px',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        lineHeight: 1,
        color: 'var(--text-whisper)',
        letterSpacing: '0.01em',
        fontWeight: 500,
      }}
    >
      {label}
    </div>
  );

  const itemStyle = (active: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minHeight: 31,
    padding: '6px 10px',
    background: active ? 'var(--overlay-hover)' : 'transparent',
    border: 'none',
    borderRadius: 6,
    color: active ? 'var(--text-body)' : 'var(--text-soft)',
    fontSize: 12,
    fontFamily: 'var(--font-sans)',
    letterSpacing: 'var(--track-ui)',
    cursor: 'pointer',
    textAlign: 'left',
  });

  const mutedBadgeStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--text-whisper)',
    fontFamily: 'var(--font-sans)',
    letterSpacing: '0.005em',
    flexShrink: 0,
  };

  return (
    <div ref={wrapRef} className={`agent-picker-wrap agent-picker-wrap--${variant}`}>
      <button
        type="button"
        className={`agent-pill targeted agent-picker-trigger agent-picker-trigger--${variant}${open ? ' open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="Choose chat target"
        aria-label="Choose chat target"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-body)',
          maxWidth: variant === 'header' ? 220 : undefined,
        }}
      >
        {activeTarget.kind === 'agent' && activeTarget.id === 'luca' ? (
          <Ghost size={14} strokeWidth={1.5} style={{ color: activeIconColor, flexShrink: 0 }} aria-hidden="true" />
        ) : activeTarget.kind === 'agent' ? (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: activeIconColor,
              display: 'inline-block',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
        ) : (
          <Bot size={14} strokeWidth={1.55} style={{ color: activeIconColor, flexShrink: 0 }} aria-hidden="true" />
        )}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeName}
        </span>
        <ChevronDown size={11} strokeWidth={1.6} style={{ flexShrink: 0, opacity: 0.65 }} aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="menu"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: 316,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'min(420px, calc(100vh - 72px))',
            overflowY: 'auto',
            padding: 4,
            background: 'var(--bg-elevated, #15161a)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            zIndex: 9999,
            animation: 'viewFadeIn 0.12s var(--ease-out)',
          }}
        >
          {sectionHeader('Agents')}
          {agents.map((agent) => {
            const isActive = activeTarget.kind === 'agent' && activeTarget.id === agent.id;
            const isLuca = agent.id === 'luca';
            return (
              <button
                key={`agent-${agent.id}`}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  onSelectAgent(agent.id);
                  setOpen(false);
                }}
                style={itemStyle(isActive)}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--overlay-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {isLuca ? (
                  <Ghost size={13} strokeWidth={1.5} style={{ color: 'var(--blue-accent)', flexShrink: 0 }} aria-hidden="true" />
                ) : (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: resolveAgentColor(agent.avatar_color),
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                )}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {normalizeAgentName(agent, agent.id)}
                </span>
                <span style={mutedBadgeStyle}>{isLuca ? 'Agent' : agent.role}</span>
              </button>
            );
          })}

          {featuredModels().length > 0 && (
            <div>
              {sectionHeader('Just released')}
              {featuredModels().map((model) => {
                const modelId = normalizeChatModelId(model.id);
                const isActive = activeTarget.kind === 'model' && normalizeChatModelId(activeTarget.id) === modelId;
                return (
                  <button
                    key={`featured-${model.id}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      onSelectModel(model.id);
                      setOpen(false);
                    }}
                    style={itemStyle(isActive)}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--overlay-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--blue-accent)',
                        boxShadow: '0 0 8px color-mix(in srgb, var(--blue-accent) 60%, transparent)',
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {model.name}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: 'var(--blue-accent)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: 'var(--track-meta)',
                        textTransform: 'uppercase',
                        padding: '1px 6px',
                        border: '1px solid color-mix(in srgb, var(--blue-accent) 45%, transparent)',
                        background: 'color-mix(in srgb, var(--blue-accent) 10%, transparent)',
                        borderRadius: 999,
                        flexShrink: 0,
                      }}
                    >
                      New
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {modelGroups.map(([lab, models]) => (
            <div key={lab}>
              {sectionHeader(LAB_LABELS[lab] || lab)}
              {models.map((model) => {
                const modelId = normalizeChatModelId(model.id);
                const isActive = activeTarget.kind === 'model' && normalizeChatModelId(activeTarget.id) === modelId;
                const flag = model.flags[0];
                return (
                  <button
                    key={`model-${model.id}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      onSelectModel(model.id);
                      setOpen(false);
                    }}
                    style={itemStyle(isActive)}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--overlay-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {model.name}
                    </span>
                    {flag && (
                      <span
                        style={{
                          ...mutedBadgeStyle,
                          color: flag.variant === 'default' ? 'var(--blue-accent)' : 'var(--text-whisper)',
                        }}
                      >
                        {flag.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
