import { useState } from 'react';
import type { HypomnemaEntry } from '@/stores/hypomnemaStore';

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const minutes = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

interface Props {
  entry: HypomnemaEntry;
  onForget: (entryId: string) => void;
}

export default function HypomnemaEntryCard({ entry, onForget }: Props) {
  const [showRevisions, setShowRevisions] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const revisions = Array.isArray(entry.revisions) ? entry.revisions : [];
  const hasRevisions = revisions.length > 0;
  const graduated = !!entry.graduated_to_engram_id;

  return (
    <article
      style={{
        padding: '14px 16px',
        borderRadius: 8,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-faint)',
        marginBottom: 10,
      }}
    >
      <header
        className="flex items-center gap-3"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 'var(--track-mono)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        <span>{entry.density}</span>
        {entry.domain ? <span>· {entry.domain}</span> : null}
        <span>· {formatRelative(entry.last_revised || entry.created_at)}</span>
        <span>· conf {entry.confidence.toFixed(2)}</span>
        {entry.foundational ? <span style={{ color: 'var(--accent-warm)' }}>· foundational</span> : null}
        {graduated ? <span style={{ color: 'var(--accent-cool)' }}>· graduated</span> : null}
        <span style={{ flex: 1 }} />
        {hasRevisions ? (
          <button
            type="button"
            onClick={() => setShowRevisions((v) => !v)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 'var(--track-mono)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
            }}
          >
            {showRevisions ? 'hide' : `${revisions.length} rev${revisions.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          aria-label="Forget this entry"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 'var(--track-mono)',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          forget
        </button>
      </header>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-primary)',
          margin: 0,
          whiteSpace: 'pre-wrap',
        }}
      >
        {entry.content}
      </p>

      {entry.tags && entry.tags.length > 0 ? (
        <div
          className="flex flex-wrap"
          style={{ gap: 6, marginTop: 10 }}
        >
          {entry.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 'var(--track-mono)',
                color: 'var(--text-ghost)',
                padding: '2px 6px',
                borderRadius: 999,
                background: 'var(--surface-base)',
                border: '1px solid var(--border-faint)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {showRevisions && hasRevisions ? (
        <ul
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'var(--surface-base)',
            borderRadius: 6,
            listStyle: 'none',
          }}
        >
          {revisions.slice(-5).reverse().map((r, i) => (
            <li
              key={i}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--text-body)',
                paddingTop: i === 0 ? 0 : 8,
                borderTop: i === 0 ? '0' : '1px dashed var(--border-faint)',
                marginTop: i === 0 ? 0 : 8,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-ghost)',
                  letterSpacing: 'var(--track-mono)',
                }}
              >
                {r.timestamp ? formatRelative(r.timestamp) : '?'}
                {typeof r.old_confidence === 'number' && typeof r.new_confidence === 'number'
                  ? ` · ${r.old_confidence.toFixed(2)}→${r.new_confidence.toFixed(2)}`
                  : ''}
                {r.challenge_verdict ? ` · ${r.challenge_verdict}` : ''}
                {' — '}
              </span>
              {r.reason || '(no reason)'}
            </li>
          ))}
        </ul>
      ) : null}

      {showConfirm ? (
        <div
          role="dialog"
          aria-label="Confirm forget"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'var(--surface-base)',
            borderRadius: 6,
            border: '1px solid var(--border-faint)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--text-body)',
              margin: '0 0 8px',
            }}
          >
            Tell {entry.agent_id} to stop carrying this? It'll deactivate the entry but keep its revision history.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onForget(entry.id);
                setShowConfirm(false);
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 'var(--track-mono)',
                color: 'var(--text-primary)',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-strong)',
                padding: '4px 10px',
                borderRadius: 999,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              forget it
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: 'var(--track-mono)',
                color: 'var(--text-ghost)',
                background: 'transparent',
                border: '1px solid var(--border-faint)',
                padding: '4px 10px',
                borderRadius: 999,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
