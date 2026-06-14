import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot } from 'lucide-react';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, getChatModelLabel } from '@/lib/chatRuntime';

interface ModelPickerProps {
  activeModelId: string;
  onChange: (modelId: string) => void;
  variant?: 'composer' | 'header';
}

export function ModelPicker({ activeModelId, onChange, variant = 'composer' }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const activeId = activeModelId || DEFAULT_CHAT_MODEL;
  const activeName = getChatModelLabel(activeId);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuWidth = 292;
      const estimatedHeight = Math.min(CHAT_MODEL_OPTIONS.length * 34 + 8, 360);
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

  return (
    <div ref={wrapRef} className={`agent-picker-wrap agent-picker-wrap--${variant}`}>
      <button
        type="button"
        className={`agent-pill targeted agent-picker-trigger agent-picker-trigger--${variant}${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Switch model"
        aria-label="Switch model"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-body)',
          maxWidth: variant === 'header' ? 190 : undefined,
        }}
      >
        <Bot size={14} strokeWidth={1.55} style={{ color: 'var(--blue-accent)', flexShrink: 0 }} aria-hidden="true" />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeName}
        </span>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: 292,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'min(360px, calc(100vh - 72px))',
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
          {CHAT_MODEL_OPTIONS.map((model) => {
            const isActive = model.id === activeId;
            return (
              <button
                key={model.id}
                onClick={() => {
                  onChange(model.id);
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
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {model.name}
                </span>
                {model.flags.slice(0, 1).map((flag) => (
                  <span
                    key={flag.label}
                    style={{
                      fontSize: 9,
                      color: flag.variant === 'default' ? 'var(--blue-accent)' : 'var(--text-whisper)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: 'var(--track-meta)',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {flag.label}
                  </span>
                ))}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
