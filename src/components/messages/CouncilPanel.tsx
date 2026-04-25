import { useState, useMemo } from 'react';
import RichBody from '@/components/rich/RichBody';

/**
 * CouncilPanel — elegant viewer for the LLM Council deliberation behind a
 * synthesis-mode message. Default UX is collapsed (a small disclosure pill);
 * when expanded, the user picks Tabs (one model at a time) or Compare
 * (side-by-side columns). An optional "ranking" sub-toggle shows the judge's
 * truncated per-variant critique.
 *
 * Renders only when the message metadata carries a council trace (kind:
 * "council", produced by chat-multi). Falls back gracefully if rankings or
 * aggregate are missing — pure variants still render in Tabs/Compare mode.
 */

export interface CouncilTrace {
  kind?: string;
  variants: Array<{ model: string; content: string; thinking?: string | null }>;
  rankings?: Array<{ judge_model: string; raw_text: string; parsed_ranking: string[] }>;
  aggregate?: Array<{ model: string; avg_rank: number; rankings_count: number }>;
  label_to_model?: Record<string, string>;
}

type ViewMode = 'tabs' | 'compare';

interface Props {
  trace: CouncilTrace;
}

/* Compact rank glyph — small mono superscript inside a soft cream halo. */
function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          width: 14,
          height: 14,
          borderRadius: 999,
          background: 'rgba(220,219,216,0.04)',
          border: '1px solid var(--border-faint)',
          marginRight: 6,
        }}
      />
    );
  }
  // Tone alpha by rank position — first place is brightest
  const alpha = rank === 1 ? 0.16 : rank === 2 ? 0.10 : 0.06;
  const ink = rank === 1 ? 'var(--text-secondary)' : 'var(--text-ghost)';
  return (
    <span
      aria-label={`rank ${rank}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        borderRadius: 999,
        background: `rgba(220,219,216,${alpha})`,
        border: '1px solid var(--border-faint)',
        fontFamily: 'var(--font-mono)',
        fontSize: 8,
        color: ink,
        letterSpacing: 0,
        marginRight: 6,
      }}
    >
      {rank}
    </span>
  );
}

/* Pill toggle for view mode. */
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Council view mode"
      style={{
        display: 'inline-flex',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-faint)',
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}
    >
      {(['tabs', 'compare'] as ViewMode[]).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          style={{
            background: mode === m ? 'var(--overlay-active)' : 'transparent',
            color: mode === m ? 'var(--text-secondary)' : 'var(--text-ghost)',
            border: 'none',
            borderRadius: 999,
            padding: '3px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'background var(--dur-normal) var(--ease-out), color var(--dur-normal) var(--ease-out)',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/* Variant card — model eyebrow with rank badge + RichBody content. */
function VariantCard({
  model,
  rank,
  content,
  thinking,
  compact = false,
}: {
  model: string;
  rank: number | null;
  content: string;
  thinking?: string | null;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-deep)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: compact ? '10px 12px' : '12px 16px',
        height: compact ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <RankBadge rank={rank} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.08em',
            color: 'var(--text-ghost)',
            textTransform: 'uppercase',
          }}
        >
          {model}
        </span>
      </div>
      {thinking && (
        <details style={{ marginBottom: 8 }}>
          <summary
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.06em',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              cursor: 'pointer',
              listStyle: 'none',
            }}
          >
            thinking
          </summary>
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.55,
              color: 'var(--text-tertiary)',
              padding: '6px 0 8px',
              fontStyle: 'italic',
            }}
          >
            {thinking}
          </div>
        </details>
      )}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--text-tertiary)',
          minHeight: 0,
          flex: 1,
          overflow: compact ? 'auto' : 'visible',
        }}
      >
        <RichBody source={content} />
      </div>
    </div>
  );
}

export default function CouncilPanel({ trace }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ViewMode>('tabs');
  const [showRanking, setShowRanking] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const variants = trace?.variants ?? [];
  const aggregate = trace?.aggregate ?? [];
  const rankings = trace?.rankings ?? [];

  // Build {model -> rank} lookup. Ordered variants put the council favorite first.
  const rankByModel = useMemo(() => {
    const map = new Map<string, number>();
    aggregate.forEach((a, i) => map.set(a.model, i + 1));
    return map;
  }, [aggregate]);

  const ordered = useMemo(() => {
    return [...variants].sort((a, b) => {
      const ra = rankByModel.get(a.model) ?? 999;
      const rb = rankByModel.get(b.model) ?? 999;
      return ra - rb;
    });
  }, [variants, rankByModel]);

  if (variants.length === 0) return null;

  const hasRankings = rankings.length > 0;
  const subtitle = aggregate.length > 0
    ? `${variants.length} voices · council ranked`
    : `${variants.length} model responses`;

  return (
    <div style={{ marginTop: 8 }}>
      {/* Disclosure header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px]"
        style={{
          color: 'var(--text-ghost)',
          letterSpacing: '0.04em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
        }}
        aria-expanded={expanded}
      >
        <span
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform var(--dur-normal) var(--ease-premium)',
            display: 'inline-block',
          }}
        >
          ›
        </span>
        {subtitle}
      </button>

      {/* Expandable body */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.4s var(--ease-premium)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ paddingTop: 8 }}>
            {/* Toolbar: view toggle + show-ranking sub-toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <ViewToggle mode={mode} onChange={setMode} />
              {hasRankings && (
                <button
                  onClick={() => setShowRanking(!showRanking)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: showRanking ? 'var(--text-secondary)' : 'var(--text-ghost)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    padding: '3px 6px',
                    transition: 'color var(--dur-normal) var(--ease-out)',
                  }}
                >
                  {showRanking ? '· ranking shown' : '· show ranking'}
                </button>
              )}
            </div>

            {/* Optional ranking strip */}
            {hasRankings && showRanking && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border-faint)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {rankings.map((r, i) => (
                  <div key={i} style={{ marginBottom: i === rankings.length - 1 ? 0 : 8 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        color: 'var(--text-ghost)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      judge · {r.judge_model.split('/').pop()}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        color: 'var(--text-tertiary)',
                        whiteSpace: 'pre-wrap',
                        // Truncate to roughly 12 lines visible; full text in title
                        maxHeight: 220,
                        overflow: 'auto',
                      }}
                      title={r.raw_text}
                    >
                      {r.raw_text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs view */}
            {mode === 'tabs' && (
              <>
                <div
                  role="tablist"
                  aria-label="Model voices"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  {ordered.map((v, i) => {
                    const rank = rankByModel.get(v.model) ?? null;
                    const isActive = i === activeTab;
                    return (
                      <button
                        key={`${v.model}-${i}`}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveTab(i)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: isActive ? 'var(--overlay-active)' : 'var(--bg-surface)',
                          border: `1px solid ${isActive ? 'var(--border-strong)' : 'var(--border-faint)'}`,
                          borderRadius: 999,
                          padding: '4px 12px 4px 6px',
                          color: isActive ? 'var(--text-secondary)' : 'var(--text-ghost)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          cursor: 'pointer',
                          transition: 'background var(--dur-normal) var(--ease-out), color var(--dur-normal) var(--ease-out), border-color var(--dur-normal) var(--ease-out)',
                        }}
                      >
                        <RankBadge rank={rank} />
                        {v.model}
                      </button>
                    );
                  })}
                </div>
                {ordered[activeTab] && (
                  <VariantCard
                    model={ordered[activeTab].model}
                    rank={rankByModel.get(ordered[activeTab].model) ?? null}
                    content={ordered[activeTab].content}
                    thinking={ordered[activeTab].thinking}
                  />
                )}
              </>
            )}

            {/* Compare view */}
            {mode === 'compare' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(ordered.length, 3)}, minmax(0, 1fr))`,
                  gap: 10,
                  // Cap the column height so each scrolls independently
                  maxHeight: 480,
                }}
              >
                {ordered.slice(0, 3).map((v, i) => (
                  <VariantCard
                    key={`${v.model}-${i}`}
                    model={v.model}
                    rank={rankByModel.get(v.model) ?? null}
                    content={v.content}
                    thinking={v.thinking}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
