import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ghost } from 'lucide-react';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { resolveAgentColor } from '@/lib/agentColors';
import { useAuthStore } from '@/stores/authStore';

interface AgentPickerProps {
  activeAgentId: string;
  onChange: (agentId: string) => void;
  variant?: 'composer' | 'header';
}

/**
 * Agent picker. Renders the popover via a portal with fixed
 * positioning so it always sits on the top layer (never occluded by the
 * composer or surrounding chrome). It prefers dropping below the trigger,
 * and flips upward only if a future placement gets too close to the viewport
 * floor.
 */
export function AgentPicker({ activeAgentId, onChange, variant = 'composer' }: AgentPickerProps) {
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
      if (!r) return;
      const menuWidth = 264;
      const estimatedHeight = Math.min(Math.max(agents.length, 1) * 34 + 8, 320);
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
  }, [agents.length, open]);

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
    <div ref={wrapRef} className={`agent-picker-wrap agent-picker-wrap--${variant}`}>
      <button
        type="button"
        className={`agent-pill targeted agent-picker-trigger agent-picker-trigger--${variant}${open ? ' open' : ''}`}
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
          // Luca's identity glyph — rich electric blue (Vercel-spec
          // #0070F3). Distinct from the sage agent-color tokens used in
          // identity dots elsewhere; this icon is the always-on "you're
          // talking to your agent" mark.
          <Ghost
            size={14}
            strokeWidth={1.5}
            style={{ color: '#0070F3', flexShrink: 0 }}
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
            width: 264,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'min(320px, calc(100vh - 72px))',
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
