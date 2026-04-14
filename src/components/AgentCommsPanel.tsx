import { useState, useEffect } from 'react';

interface Variant {
  model: string;
  content: string;
}

interface AgentCommsPanelProps {
  variants: Variant[];
  isSynthesizing: boolean;
  visible: boolean;
  onClose: () => void;
}

export default function AgentCommsPanel({ variants, isSynthesizing, visible, onClose }: AgentCommsPanelProps) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when new variants arrive
  useEffect(() => {
    if (variants.length > 0) setDismissed(false);
  }, [variants.length]);

  if (!visible || dismissed || variants.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 44,
      bottom: 0,
      width: 340,
      background: 'var(--bg-elevated)',
      borderLeft: '1px solid var(--border-subtle)',
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
      animation: 'viewFadeIn 0.2s var(--ease-out) both',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{
        height: 40,
        padding: '0 14px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div className="flex items-center gap-2">
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: isSynthesizing ? 'var(--accent-luca)' : '#8ca89c',
            animation: isSynthesizing ? 'breathe 2s ease-in-out infinite' : undefined,
          }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
            {isSynthesizing ? 'Synthesizing' : 'Model Responses'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
            {variants.length}/3
          </span>
        </div>
        <button
          onClick={() => { setDismissed(true); onClose(); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', fontSize: 14 }}
        >
          ×
        </button>
      </div>

      {/* Variant cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        <div className="flex flex-col gap-3">
          {variants.map((v, i) => (
            <div key={i} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
            }}>
              <div style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--text-ghost)', marginBottom: 6,
              }}>
                {v.model}
              </div>
              <div style={{
                fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)',
                maxHeight: 200, overflow: 'auto',
              }}>
                {v.content.slice(0, 500)}{v.content.length > 500 ? '...' : ''}
              </div>
            </div>
          ))}

          {/* Pending model slots */}
          {variants.length < 3 && !isSynthesizing && (
            Array.from({ length: 3 - variants.length }).map((_, i) => (
              <div key={`pending-${i}`} style={{
                background: 'var(--bg-surface)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 12px',
                textAlign: 'center',
              }}>
                <div className="flex items-center justify-center gap-1.5">
                  {[0, 1, 2].map((j) => (
                    <div key={j} style={{
                      width: 3, height: 3, borderRadius: '50%', background: 'var(--text-whisper)',
                      animation: `breathe-dot 1.4s ease-in-out ${j * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-whisper)', marginTop: 6 }}>
                  waiting for response
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
