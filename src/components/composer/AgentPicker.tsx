import { useEffect, useRef, useState } from 'react';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { resolveAgentColor } from '@/lib/agentColors';
import { useUserStore } from '@/stores/userStore';

interface AgentPickerProps {
  activeAgentId: string;
  onChange: (agentId: string) => void;
}

/**
 * Composer agent picker. Shows the active agent as a pill; clicking opens a
 * popover with every agent the user has (system + custom). Selecting one
 * binds the current thread to that agent.
 */
export function AgentPicker({ activeAgentId, onChange }: AgentPickerProps) {
  const user = useUserStore((s) => s.user);
  const agents = useAgentSettingsStore((s) => s.agents);
  const load = useAgentSettingsStore((s) => s.load);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && agents.length === 0) load(user.id);
  }, [user, agents.length, load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  const active = agents.find((a) => a.id === activeAgentId);
  const activeName = active?.name?.toLowerCase() || activeAgentId || 'luca';
  const activeColor = resolveAgentColor(active?.avatar_color);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className="agent-pill targeted"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-body)',
        }}
        title="Switch agent"
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: activeColor,
            display: 'inline-block',
          }}
        />
        {activeName}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            minWidth: 200,
            padding: 4,
            background: 'var(--bg-elevated, #15161a)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            zIndex: 50,
            animation: 'viewFadeIn 0.12s var(--ease-out)',
          }}
        >
          {agents.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-tertiary)' }}>
              Loading agents…
            </div>
          )}
          {agents.map((a) => {
            const isActive = a.id === activeAgentId;
            return (
              <button
                key={a.id}
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  background: isActive ? 'var(--overlay-hover)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: isActive ? 'var(--text-body)' : 'var(--text-soft)',
                  fontSize: 12,
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: 'var(--track-ui)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--overlay-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: resolveAgentColor(a.avatar_color),
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{a.name.toLowerCase()}</span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-whisper)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {a.role}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
