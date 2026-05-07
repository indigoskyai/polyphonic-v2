import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ghost } from 'lucide-react';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { resolveAgentColor } from '@/lib/agentColors';
import { useAuthStore } from '@/stores/authStore';

interface AgentPickerProps {
  activeAgentId: string;
  onChange: (agentId: string) => void;
}

/**
 * Composer agent picker. Renders the popover via a portal with fixed
 * positioning so it always sits on the top layer (never occluded by the
 * composer or surrounding chrome). Drops down BELOW the trigger.
 */
export function AgentPicker({ activeAgentId, onChange }: AgentPickerProps) {
  const user = useAuthStore((s) => s.user);
  const allAgents = useAgentSettingsStore((s) => s.agents);
  const load = useAgentSettingsStore((s) => s.load);

  // Observer is not a selectable agent — it's a resident watcher reachable
  // via its dedicated chip in the composer.
  const agents = allAgents.filter((a) => a.id !== 'observer');

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && allAgents.length === 0) load(user.id);
  }, [user, allAgents.length, load]);

  // Position popover under the trigger. Recompute on scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: r.left });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Outside click + ESC
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
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

  const active = agents.find((a) => a.id === activeAgentId) || allAgents.find((a) => a.id === activeAgentId);
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
        {activeAgentId === 'luca' ? (
          // Luca's identity glyph — small ghost in the brand sage tone.
          <Ghost
            size={14}
            strokeWidth={1.5}
            style={{ color: activeColor, flexShrink: 0 }}
          />
        ) : (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: activeColor,
              display: 'inline-block',
            }}
          />
        )}
        {activeName}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: 220,
            padding: 4,
            background: 'var(--bg-elevated, #15161a)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            zIndex: 9999,
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
                {a.locked && (
                  <span
                    title="Resident agent"
                    style={{
                      fontSize: 9,
                      color: 'var(--text-whisper)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: 'var(--track-meta)',
                      textTransform: 'uppercase',
                      marginRight: 4,
                    }}
                  >
                    resident
                  </span>
                )}
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
        </div>,
        document.body
      )}
    </div>
  );
}
