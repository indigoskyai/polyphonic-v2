import { useMemo } from 'react';
import { useMemoryStore, type Belief } from '@/stores/memoryStore';

const TIER_ORDER = ['conviction', 'strong', 'moderate', 'tentative', 'uncertain'] as const;
const TIER_COLORS: Record<string, string> = {
  conviction: '#c9a87c',
  strong: '#8ca89c',
  moderate: 'var(--text-tertiary)',
  tentative: 'var(--text-ghost)',
  uncertain: 'var(--text-whisper)',
};

function getTier(confidence: number): string {
  if (confidence >= 0.9) return 'conviction';
  if (confidence >= 0.7) return 'strong';
  if (confidence >= 0.5) return 'moderate';
  if (confidence >= 0.3) return 'tentative';
  return 'uncertain';
}

function BeliefCard({ belief }: { belief: Belief }) {
  const tier = belief.confidence_tier || getTier(belief.confidence);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
        {belief.content}
      </div>

      <div className="flex items-center gap-3">
        <div style={{ flex: 1, height: 3, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${belief.confidence * 100}%`,
            height: '100%',
            background: TIER_COLORS[tier] || 'var(--text-ghost)',
            borderRadius: 2,
          }} />
        </div>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>
          {(belief.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div className="flex items-center gap-3 mt-2">
        {belief.supporting_engram_ids?.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>
            {belief.supporting_engram_ids.length} supporting
          </span>
        )}
        {belief.contradicting_engram_ids?.length > 0 && (
          <span style={{ fontSize: 10, color: '#ad5b5b' }}>
            {belief.contradicting_engram_ids.length} contradicting
          </span>
        )}
        {belief.domain && belief.domain !== 'general' && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-deep)', color: 'var(--text-ghost)' }}>
            {belief.domain}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BeliefsTab() {
  const { beliefs } = useMemoryStore();

  const grouped = useMemo(() => {
    const groups: Record<string, Belief[]> = {};
    for (const tier of TIER_ORDER) groups[tier] = [];

    for (const belief of beliefs) {
      const tier = belief.confidence_tier || getTier(belief.confidence);
      if (groups[tier]) groups[tier].push(belief);
      else groups.uncertain.push(belief);
    }

    return groups;
  }, [beliefs]);

  const totalBeliefs = beliefs.length;

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
        {totalBeliefs} beliefs
      </div>

      {totalBeliefs === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-ghost)', fontSize: 12 }}>
          No beliefs formed yet. Beliefs emerge from patterns across multiple memories.
        </div>
      )}

      {TIER_ORDER.map((tier) => {
        const group = grouped[tier];
        if (group.length === 0) return null;

        return (
          <div key={tier} style={{ marginBottom: 24 }}>
            <div className="flex items-center gap-2 mb-3">
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: TIER_COLORS[tier],
              }}>
                {tier}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
                {group.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {group.map((belief) => (
                <BeliefCard key={belief.id} belief={belief} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
