import React, { useState } from 'react';

/* ======================================================================
   CodeBlock — mono code with optional `$` prompt + copy button.
   Used for install commands.
   ====================================================================== */

interface CodeBlockProps {
  code: string;
  prompt?: string; // typically "$"
}

export function CodeBlock({ code, prompt = '$' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-md, 10px)',
        overflow: 'hidden',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          flex: 1,
          padding: '12px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          color: 'var(--text-primary)',
          letterSpacing: 'var(--track-body-tight)',
          overflow: 'auto',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {prompt && (
          <span
            style={{
              color: 'var(--text-soft)',
              marginRight: 10,
              userSelect: 'none',
            }}
          >
            {prompt}
          </span>
        )}
        {code}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          padding: '0 16px',
          background: 'transparent',
          border: 'none',
          borderLeft: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 'var(--weight-medium)',
          color: copied ? 'var(--green-accent, #4ade80)' : 'var(--text-tertiary)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'color 180ms var(--ease-out), background 180ms var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          if (!copied) {
            e.currentTarget.style.color = 'var(--ink)';
            e.currentTarget.style.background = 'var(--overlay-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!copied) {
            e.currentTarget.style.color = 'var(--text-tertiary)';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/* ======================================================================
   PairCodeDisplay — 6-digit pair code with countdown.
   The setpiece moment of /settings/local-runtime.
   ====================================================================== */

interface PairCodeDisplayProps {
  code: string | null; // 6-character code, or null if none active
  expiresAt: number | null; // epoch ms
  now: number; // current epoch ms (passed in so parent owns the tick)
  issuing?: boolean;
  onIssue: () => void;
}

export function PairCodeDisplay({
  code,
  expiresAt,
  now,
  issuing,
  onIssue,
}: PairCodeDisplayProps) {
  const remaining = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const countdownText =
    expiresAt && remaining > 0
      ? `${minutes}:${String(seconds).padStart(2, '0')}`
      : '—';

  // Render placeholder digits if no code yet
  const digits = (code ?? '------').split('');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 14,
        padding: '24px 28px',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-md, 10px)',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          fontWeight: 'var(--weight-medium)',
          color: 'var(--text-soft)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
        }}
      >
        Pairing code · one-time
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <DigitGroup digits={digits.slice(0, 3)} active={!!code} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: 22,
            color: 'var(--text-faint)',
          }}
        >
          ·
        </div>
        <DigitGroup digits={digits.slice(3, 6)} active={!!code} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          paddingTop: 4,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            letterSpacing: 'var(--track-body-tight)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {expiresAt && remaining > 0 ? (
            <>
              expires in{' '}
              <span style={{ color: 'var(--ink)', fontWeight: 450 }}>
                {countdownText}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>no active code</span>
          )}
        </div>
        <button
          type="button"
          className="set-btn compact"
          onClick={onIssue}
          disabled={issuing}
        >
          {issuing ? 'Issuing…' : code ? 'Issue new code' : 'Issue code'}
        </button>
      </div>
    </div>
  );
}

function DigitGroup({ digits, active }: { digits: string[]; active: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {digits.map((d, i) => (
        <div
          key={i}
          style={{
            width: 44,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--canvas)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 10px)',
            fontFamily: 'var(--font-mono)',
            fontSize: 28,
            color: active ? 'var(--ink)' : 'var(--text-faint)',
            letterSpacing: 'var(--track-display)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 450,
          }}
        >
          {d}
        </div>
      ))}
    </div>
  );
}
