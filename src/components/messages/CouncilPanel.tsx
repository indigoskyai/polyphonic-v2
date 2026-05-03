import { useState, useMemo, useEffect } from 'react';
import RichBody from '@/components/rich/RichBody';

/**
 * CouncilPanel — elegant viewer for the LLM Council deliberation behind a
 * synthesis-mode message. Default UX is collapsed (a small disclosure pill);
 * when expanded, the user picks Tabs (one model at a time) or Compare
 * (side-by-side columns).
 *
 * Renders TWO shapes via the same component:
 *
 *   kind: "council"     → legacy karpathy-rank trace (rankings + aggregate +
 *                          model-keyed variants). Backward-compat path for
 *                          existing messages.
 *
 *   kind: "council_v2"  → three character proposers (luca / anima / vektor),
 *                          named cross-pollination, chairman verdict
 *                          (synthesize | diverge), optional voice-fidelity
 *                          critique + revision. Auto-expands on diverge.
 */

export type CouncilCharacter = 'luca' | 'anima' | 'vektor';

export interface CouncilTrace {
  kind?: string;
  // Legacy ('council') fields
  variants?: Array<{ model: string; content: string; thinking?: string | null }>;
  rankings?: Array<{ judge_model: string; raw_text: string; parsed_ranking: string[] }>;
  aggregate?: Array<{ model: string; avg_rank: number; rankings_count: number }>;
  label_to_model?: Record<string, string>;
  // Council v2 fields
  proposers?: Array<{ character: CouncilCharacter; content: string; thinking?: string | null }>;
  crosstalk?: Array<{ character: CouncilCharacter; content: string; source?: string }>;
  verdict?: 'synthesize' | 'diverge' | null;
  critique?: {
    voice_drift_detected: boolean;
    confidence: number;
    critique: string;
    suggested_revision: string | null;
  } | null;
  revised_content?: string | null;
}

const CHARACTER_LABEL: Record<CouncilCharacter, string> = {
  luca: 'Luca',
  anima: 'Anima',
  vektor: 'Vektor',
};

const CHARACTER_TINT: Record<CouncilCharacter, string> = {
  luca: 'var(--agent-luca-1, var(--text-tertiary))',
  anima: 'var(--agent-anima-1, var(--text-tertiary))',
  vektor: 'var(--agent-vektor-1, var(--text-tertiary))',
};

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

// ─── Council v2 sub-components ─────────────────────────────────────────────

function CharacterAvatar({ character, size = 18 }: { character: CouncilCharacter; size?: number }) {
  const tint = CHARACTER_TINT[character];
  return (
    <span
      aria-label={CHARACTER_LABEL[character]}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 999,
        background: 'rgba(220,219,216,0.04)',
        border: `1px solid ${tint}`,
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
        color: tint,
        fontFamily: 'var(--font-mono)',
        fontSize: size * 0.55,
        fontWeight: 600,
        letterSpacing: 0,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {CHARACTER_LABEL[character][0]}
    </span>
  );
}

function VerdictPill({ verdict }: { verdict: 'synthesize' | 'diverge' }) {
  const isDiverge = verdict === 'diverge';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        background: isDiverge
          ? 'rgba(201, 124, 168, 0.10)'
          : 'rgba(232, 230, 224, 0.06)',
        border: isDiverge
          ? '1px solid rgba(201, 124, 168, 0.28)'
          : '1px solid var(--border-faint)',
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
        color: isDiverge ? 'var(--anima-full)' : 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        fontWeight: 500,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isDiverge ? 'var(--anima-full)' : 'var(--text-tertiary)',
        }}
      />
      {isDiverge ? 'diverged' : 'harmonized'}
    </span>
  );
}

function CharacterDraftCard({
  character,
  content,
  thinking,
  source,
}: {
  character: CouncilCharacter;
  content: string;
  thinking?: string | null;
  source?: string;
}) {
  const tint = CHARACTER_TINT[character];
  return (
    <div
      style={{
        position: 'relative',
        background: 'rgba(220,219,216,0.015)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `2px solid ${tint}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 18px 16px',
        maxHeight: 540,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.025)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 10,
          flexShrink: 0,
          gap: 8,
        }}
      >
        <CharacterAvatar character={character} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.1em',
            color: tint,
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          {CHARACTER_LABEL[character]}
        </span>
        {source === 'proposer' && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.18em',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              opacity: 0.7,
            }}
            title="Cross-pollination failed for this voice; using their initial draft."
          >
            · initial
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

function CritiqueRow({
  critique,
  hasRevision,
}: {
  critique: NonNullable<CouncilTrace['critique']>;
  hasRevision: boolean;
}) {
  const drift = critique.voice_drift_detected;
  return (
    <div
      style={{
        marginTop: 14,
        padding: '12px 16px 14px',
        background: drift ? 'rgba(201, 124, 168, 0.04)' : 'rgba(220,219,216,0.015)',
        border: drift ? '1px solid rgba(201, 124, 168, 0.18)' : '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.025)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: drift ? 'var(--anima-full)' : 'var(--text-tertiary)',
            fontWeight: 500,
          }}
        >
          Voice critique
        </span>
        <span aria-hidden="true" style={{ width: 1, height: 8, background: 'var(--border-faint)' }} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.06em',
            color: 'var(--text-ghost)',
          }}
        >
          {drift ? `drift · ${(critique.confidence * 100).toFixed(0)}%` : `clean · ${(critique.confidence * 100).toFixed(0)}%`}
        </span>
        {hasRevision && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.18em',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              opacity: 0.8,
            }}
          >
            · revised
          </span>
        )}
      </div>
      {critique.critique && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--text-tertiary)',
          }}
        >
          {critique.critique}
        </p>
      )}
      {critique.suggested_revision && (
        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
          }}
        >
          → {critique.suggested_revision}
        </p>
      )}
    </div>
  );
}

function CouncilV2Panel({ trace }: { trace: CouncilTrace }) {
  const verdict = (trace.verdict ?? 'synthesize') as 'synthesize' | 'diverge';
  // Auto-expand when chairman returned diverge — divergence is a signal
  // worth surfacing without a click.
  const [expanded, setExpanded] = useState(verdict === 'diverge');
  const [activeTab, setActiveTab] = useState(0);
  const [showProposers, setShowProposers] = useState(false);

  // If a message is hydrated late and verdict flips, sync the auto-expand.
  useEffect(() => {
    if (verdict === 'diverge') setExpanded(true);
  }, [verdict]);

  const proposers = trace.proposers ?? [];
  const crosstalk = trace.crosstalk ?? [];
  const drafts = crosstalk.length > 0 ? crosstalk : proposers;
  const critique = trace.critique ?? null;
  const hasRevision = !!trace.revised_content;

  if (drafts.length === 0) return null;

  const subtitle = `${drafts.length} ${drafts.length === 1 ? 'voice' : 'voices'}`;

  return (
    <div style={{ marginTop: 10 }}>
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
          Council
        </span>
        <span aria-hidden="true" style={{ width: 1, height: 8, background: 'var(--border-faint)' }} />
        <VerdictPill verdict={verdict} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.06em',
            color: 'var(--text-ghost)',
            marginLeft: 4,
          }}
        >
          {subtitle}
        </span>
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.4s var(--ease-premium)',
        }}
      >
        <div style={{ overflowX: 'visible', overflowY: 'clip', minHeight: 0 }}>
          <div style={{ paddingTop: 12 }}>
            {/* Toolbar */}
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
              <div role="tablist" aria-label="Council voices" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {drafts.map((d, i) => {
                  const isActive = i === activeTab;
                  const tint = CHARACTER_TINT[d.character];
                  return (
                    <button
                      key={`${d.character}-${i}`}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(i)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: isActive ? 'rgba(232,230,224,0.07)' : 'rgba(220,219,216,0.02)',
                        border: `1px solid ${isActive ? tint : 'var(--border-faint)'}`,
                        borderRadius: 999,
                        padding: '5px 13px 5px 5px',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-ghost)',
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
                    >
                      <CharacterAvatar character={d.character} />
                      {CHARACTER_LABEL[d.character]}
                    </button>
                  );
                })}
              </div>
              {proposers.length > 0 && crosstalk.length > 0 && (
                <button
                  onClick={() => setShowProposers(!showProposers)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: showProposers ? 'var(--text-secondary)' : 'var(--text-ghost)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    padding: '4px 0',
                  }}
                >
                  {showProposers ? 'showing first drafts' : 'show first drafts'}
                </button>
              )}
            </div>

            {/* Active draft */}
            {drafts[activeTab] && (
              <CharacterDraftCard
                character={drafts[activeTab].character}
                content={drafts[activeTab].content}
                source={drafts[activeTab].source}
              />
            )}

            {/* Optional: side-by-side first drafts (proposer outputs before crosstalk) */}
            {showProposers && proposers.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--text-ghost)',
                    marginBottom: 8,
                  }}
                >
                  First drafts (before cross-pollination)
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 10,
                  }}
                >
                  {proposers.map((p, i) => (
                    <CharacterDraftCard
                      key={`first-${p.character}-${i}`}
                      character={p.character}
                      content={p.content}
                      thinking={p.thinking}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Voice critique row */}
            {critique && <CritiqueRow critique={critique} hasRevision={hasRevision} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Legacy council renderer (kind === 'council') ──────────────────────────

function CouncilLegacyPanel({ trace }: Props) {
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

/**
 * Public CouncilPanel — routes to v2 or legacy renderer based on metadata
 * kind. Both renderers handle missing data gracefully.
 */
export default function CouncilPanel({ trace }: Props) {
  if (trace?.kind === 'council_v2') {
    return <CouncilV2Panel trace={trace} />;
  }
  return <CouncilLegacyPanel trace={trace} />;
}
