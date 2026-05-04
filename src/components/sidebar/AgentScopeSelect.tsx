import { useState, useRef, useEffect } from 'react';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

export default function AgentScopeSelect() {
  const { activeAgentId, availableAgents, setActiveAgent } = useAgentScopeStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = availableAgents.find((a) => a.id === activeAgentId) ?? availableAgents[0];
  const single = availableAgents.length <= 1;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ padding: '0 16px 10px', position: 'relative' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-folio)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Agent
      </div>
      <button
        type="button"
        onClick={() => !single && setOpen((o) => !o)}
        disabled={single}
        className="w-full flex items-center justify-between"
        style={{
          padding: '8px 10px',
          background: 'var(--overlay-hover)',
          border: '1px solid var(--border-faint)',
          borderRadius: 8,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: 'var(--track-body)',
          cursor: single ? 'default' : 'pointer',
          opacity: single ? 0.85 : 1,
        }}
      >
        <span className="flex items-center" style={{ gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--text-soft)',
              display: 'inline-block',
            }}
          />
          {active?.name ?? '—'}
        </span>
        <svg
          width={10}
          height={10}
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          style={{ color: 'var(--text-ghost)', opacity: single ? 0.4 : 1 }}
        >
          <path d="M2.5 4l2.5 2.5L7.5 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && !single && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            marginTop: 4,
            background: 'var(--canvas)',
            border: '1px solid var(--border-faint)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-panel)',
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          {availableAgents.map((a) => (
            <button
              key={a.id}
              type="button"
              className="w-full text-left"
              onClick={() => {
                setActiveAgent(a.id);
                setOpen(false);
              }}
              style={{
                padding: '8px 12px',
                background: a.id === activeAgentId ? 'var(--overlay-active)' : 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: a.id === activeAgentId ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
