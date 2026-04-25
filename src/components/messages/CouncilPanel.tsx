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

/* Rank glyph — mono digit inside a graduated cream halo. Rank 1 reads as
 * the council favorite (warmer fill + subtle inset highlight); 2 and 3 step
 * down progressively. */
function RankBadge({ rank, size = 'sm' }: { rank: number | null; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 18 : 16;
  if (rank === null) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          width: dim,
          height: dim,
          borderRadius: 999,
          background: 'rgba(220,219,216,0.03)',
          border: '1px solid var(--border-faint)',
          marginRight: 7,
          flexShrink: 0,
        }}
      />
    );
  }
  // Rank 1 = brightest cream + inset highlight; 2 = dim cream; 3 = ghost.
  const fillAlpha = rank === 1 ? 0.14 : rank === 2 ? 0.08 : 0.04;
  const borderAlpha = rank === 1 ? 0.18 : rank === 2 ? 0.10 : 0.06;
  const ink = rank === 1 ? 'var(--text-primary)' : rank === 2 ? 'var(--text-secondary)' : 'var(--text-ghost)';
  const insetHighlight = rank === 1 ? 'inset 0 0.5px 0 rgba(255,255,255,0.06)' : 'none';
  return (
    <span
      aria-label={`rank ${rank}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        borderRadius: 999,
        background: `rgba(232,230,224,${fillAlpha})`,
        border: `1px solid rgba(232,230,224,${borderAlpha})`,
        boxShadow: insetHighlight,
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        fontWeight: 500,
        color: ink,
        letterSpacing: 0,
        lineHeight: 1,
        marginRight: 7,
        flexShrink: 0,
      }}
    >
      {rank}
    </span>
  );
}

/* Pill toggle for view mode — segmented control with inset-highlight on the
 * active segment so it reads as elevated, matching the input-shell pattern. */
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Council view mode"
      style={{
        display: 'inline-flex',
        background: 'rgba(220,219,216,0.025)',
        border: '1px solid var(--border-faint)',
        borderRadius: 999,
        padding: 3,
        gap: 1,
      }}
    >
      {(['tabs', 'compare'] as ViewMode[]).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          style={{
            background: mode === m ? 'rgba(232,230,224,0.08)' : 'transparent',
            color: mode === m ? 'var(--text-primary)' : 'var(--text-ghost)',
            border: 'none',
            borderRadius: 999,
            padding: '4px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: mode === m ? 500 : 400,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: mode === m
              ? 'inset 0 0.5px 0 rgba(255,255,255,0.07), 0 1px 2px rgba(0,0,0,0.18)'
              : 'none',
            transition: 'background var(--dur-normal) var(--ease-out), color var(--dur-normal) var(--ease-out), box-shadow var(--dur-normal) var(--ease-out), font-weight var(--dur-normal) var(--ease-out)',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/* Variant card — model eyebrow with rank badge + RichBody content.
 * Rank 1 (council favorite) gets a slightly brighter inset highlight and a
 * subtle "FAVORED" mark to mark it without shouting. Same height cap, scroll,
 * and bottom fade in both Tabs and Compare views — they're the same card. */
function VariantCard({
  model,
  rank,
  content,
  thinking,
}: {
  model: string;
  rank: number | null;
  content: string;
  thinking?: string | null;
}) {
  const isFavorite = rank === 1;
  return (
    <div
      style={{
        position: 'relative',
        background: isFavorite
          ? 'linear-gradient(180deg, rgba(232,230,224,0.025) 0%, rgba(232,230,224,0.008) 40%)'
          : 'rgba(220,219,216,0.015)',
        border: `1px solid ${isFavorite ? 'rgba(232,230,224,0.10)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 18px 16px',
        maxHeight: 540,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxShadow: isFavorite
          ? 'inset 0 0.5px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.18)'
          : 'inset 0 0.5px 0 rgba(255,255,255,0.025)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 10,
          flexShrink: 0,
        }}
      >
        <RankBadge rank={rank} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.1em',
            color: isFavorite ? 'var(--text-secondary)' : 'var(--text-ghost)',
            textTransform: 'uppercase',
            fontWeight: isFavorite ? 500 : 400,
          }}
        >
          {model}
        </span>
        {isFavorite && (
          <span
            aria-hidden="true"
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.18em',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              opacity: 0.7,
            }}
          >
            · favored
          </span>
        )}
      </div>
      {thinking && (
        <details style={{ marginBottom: 10 }}>
          <summary
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.08em',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              cursor: 'pointer',
              listStyle: 'none',
              padding: '2px 0',
            }}
          >
            thinking
          </summary>
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.55,
              color: 'var(--text-tertiary)',
              padding: '6px 0 10px',
              fontStyle: 'italic',
              opacity: 0.85,
            }}
          >
            {thinking}
          </div>
        </details>
      )}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text-tertiary)',
          minHeight: 0,
          flex: 1,
          overflow: 'auto',
          // Soften the bottom of overflowing content with a mask gradient.
          // Card border stays sharp all the way around since the mask is on
          // the inner scroll region only.
          WebkitMaskImage:
            'linear-gradient(180deg, #000 0, #000 calc(100% - 28px), transparent 100%)',
          maskImage:
            'linear-gradient(180deg, #000 0, #000 calc(100% - 28px), transparent 100%)',
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
  const isCouncil = aggregate.length > 0;
  const subtitle = isCouncil
    ? `${variants.length} voices · ranked`
    : `${variants.length} responses`;

  return (
    <div style={{ marginTop: 10 }}>
      {/* Disclosure header — distinctive COUNCIL eyebrow + meta in one row */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          color: 'var(--text-ghost)',
          transition: 'color var(--dur-normal) var(--ease-out)',
        }}
        aria-expanded={expanded}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-ghost)'; }}
      >
        <span
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform var(--dur-normal) var(--ease-premium)',
            display: 'inline-block',
            fontSize: 12,
            lineHeight: 1,
            color: 'var(--text-tertiary)',
          }}
        >
          ›
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}
        >
          {isCouncil ? 'Council' : 'Voices'}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 1,
            height: 8,
            background: 'var(--border-faint)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.06em',
            color: 'var(--text-ghost)',
          }}
        >
          {subtitle}
        </span>
      </button>

      {/* Expandable body */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.4s var(--ease-premium)',
        }}
      >
        <div style={{ overflowX: 'visible', overflowY: 'clip', minHeight: 0 }}>
          <div style={{ paddingTop: 12 }}>
            {/* Toolbar: view toggle + show-ranking sub-toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
                gap: 12,
                flexWrap: 'wrap',
                paddingBottom: 12,
                borderBottom: '1px solid var(--border-faint)',
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
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    padding: '4px 0',
                    transition: 'color var(--dur-normal) var(--ease-out)',
                  }}
                  onMouseEnter={(e) => { if (!showRanking) e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                  onMouseLeave={(e) => { if (!showRanking) e.currentTarget.style.color = 'var(--text-ghost)'; }}
                >
                  {showRanking ? 'ranking ·' : 'show ranking'}
                </button>
              )}
            </div>

            {/* Optional ranking strip */}
            {hasRankings && showRanking && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '12px 16px 14px',
                  background: 'rgba(220,219,216,0.015)',
                  border: '1px solid var(--border-faint)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.025)',
                }}
              >
                {rankings.map((r, i) => (
                  <div key={i} style={{ marginBottom: i === rankings.length - 1 ? 0 : 10 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.18em',
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                        }}
                      >
                        Judge
                      </span>
                      <span aria-hidden="true" style={{ width: 1, height: 8, background: 'var(--border-faint)' }} />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9.5,
                          letterSpacing: '0.06em',
                          color: 'var(--text-ghost)',
                        }}
                      >
                        {r.judge_model.split('/').pop()}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: 'var(--text-tertiary)',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 240,
                        overflow: 'auto',
                        paddingRight: 4,
                      }}
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
                    marginBottom: 14,
                  }}
                >
                  {ordered.map((v, i) => {
                    const rank = rankByModel.get(v.model) ?? null;
                    const isActive = i === activeTab;
                    const isFavorite = rank === 1;
                    return (
                      <button
                        key={`${v.model}-${i}`}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveTab(i)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: isActive
                            ? 'rgba(232,230,224,0.07)'
                            : 'rgba(220,219,216,0.02)',
                          border: `1px solid ${
                            isActive
                              ? 'rgba(232,230,224,0.16)'
                              : 'var(--border-faint)'
                          }`,
                          borderRadius: 999,
                          padding: '5px 13px 5px 5px',
                          color: isActive
                            ? 'var(--text-primary)'
                            : isFavorite
                              ? 'var(--text-secondary)'
                              : 'var(--text-ghost)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          fontWeight: isActive ? 500 : 400,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          cursor: 'pointer',
                          boxShadow: isActive
                            ? 'inset 0 0.5px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.18)'
                            : 'none',
                          transition: 'background var(--dur-normal) var(--ease-out), color var(--dur-normal) var(--ease-out), border-color var(--dur-normal) var(--ease-out), box-shadow var(--dur-normal) var(--ease-out)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'rgba(232,230,224,0.04)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = 'rgba(220,219,216,0.02)';
                            e.currentTarget.style.color = isFavorite
                              ? 'var(--text-secondary)'
                              : 'var(--text-ghost)';
                          }
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

            {/* Compare view — auto-fit columns at min 280px so they always
                read comfortably. On wide viewports, extends out of the 720px
                message column with clamped negative margins. The grid sits
                inside msg-body which is offset ~48px right of parent center
                (sidehead width / 2), so we shift it left by 48 with
                asymmetric margins to recover symmetric breathing room. On
                narrow viewports, columns reflow to 2 (or 1) rows
                automatically and the shift clamps to 0. */}
            {mode === 'compare' && (() => {
              // Available extension formula:
              //   100vw  - rail - sidebar - msgBody (560) - sidehead+gap (96) - inset gaps (24) = available
              //   available / 2 = max extension per side
              // Capped at 320 so on ultra-wide displays columns stay sane.
              const ext = 'min(320px, max(0px, (100vw - var(--rail-width) - var(--sidebar-width) - 680px) / 2))';
              const shift = `min(48px, ${ext})`;
              return (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`,
                  gap: 12,
                  marginLeft: `calc(-1 * (${ext} + ${shift}))`,
                  marginRight: `calc(-1 * (${ext} - ${shift}))`,
                }}
              >
                {ordered.slice(0, 3).map((v, i) => (
                  <VariantCard
                    key={`${v.model}-${i}`}
                    model={v.model}
                    rank={rankByModel.get(v.model) ?? null}
                    content={v.content}
                    thinking={v.thinking}
                  />
                ))}
              </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
