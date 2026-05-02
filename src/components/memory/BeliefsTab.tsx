/**
 * BeliefsTab (Mnemos) — Round 2.
 * Mirrors Mind/Beliefs aesthetic: tier-grouped flat list with confidence bar
 * + supporting/contradicting counts.
 */
import { useMemo, useState } from 'react';
import { useMemoryStore, type Belief } from '@/stores/memoryStore';
import MnemosStreamShell, { type StreamFilter } from './MnemosStreamShell';

const TIER_ORDER = ['conviction', 'strong', 'moderate', 'tentative', 'uncertain'] as const;

function getTier(c: number): string {
  if (c >= 0.9) return 'conviction';
  if (c >= 0.7) return 'strong';
  if (c >= 0.5) return 'moderate';
  if (c >= 0.3) return 'tentative';
  return 'uncertain';
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function BeliefRow({ belief }: { belief: Belief }) {
  const tier = belief.confidence_tier || getTier(belief.confidence);
  const fresh = belief.updated_at && Date.now() - new Date(belief.updated_at).getTime() < 24 * 60 * 60 * 1000;
  return (
    <div className="s-belief">
      <div className="s-belief-head">
        <span className="s-belief-domain">
          {belief.domain || 'general'} · {tier}
        </span>
        <span className="s-belief-conf">{(belief.confidence * 100).toFixed(0)}%</span>
      </div>
      <div className="s-belief-content">{belief.content}</div>
      <div className="s-belief-foot">
        <div className="s-belief-bar">
          <div className="s-belief-bar-fill" style={{ width: `${belief.confidence * 100}%` }} />
        </div>
        {belief.supporting_engram_ids?.length > 0 && (
          <span className="s-belief-revised">{belief.supporting_engram_ids.length} support</span>
        )}
        {belief.contradicting_engram_ids?.length > 0 && (
          <span className="s-belief-revised" style={{ color: 'var(--red-accent, #c97c8a)' }}>
            {belief.contradicting_engram_ids.length} contra
          </span>
        )}
        <span className={`s-belief-revised${fresh ? ' fresh' : ''}`}>
          {fresh ? 'revised' : 'stable'} · {timeAgo(belief.updated_at || belief.created_at)}
        </span>
      </div>
    </div>
  );
}

export default function BeliefsTab() {
  const { beliefs } = useMemoryStore();
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let list = beliefs;
    if (filter === 'recent') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((b) => new Date(b.updated_at || b.created_at).getTime() >= cutoff);
    } else if (filter === 'salient') {
      list = list.filter((b) => b.confidence >= 0.7);
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((b) => b.content.toLowerCase().includes(q));
    }
    return list;
  }, [beliefs, filter, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, Belief[]> = {};
    for (const t of TIER_ORDER) groups[t] = [];
    for (const b of filtered) {
      const tier = b.confidence_tier || getTier(b.confidence);
      (groups[tier] || groups.uncertain).push(b);
    }
    return groups;
  }, [filtered]);

  return (
    <MnemosStreamShell
      num="03"
      streamLabel="BELIEFS STREAM"
      title="Beliefs"
      subtitle={`${filtered.length} belief${filtered.length === 1 ? '' : 's'} formed across the substrate. Patterns confidence-rated and grouped by tier.`}
      searchPlaceholder="Search beliefs…"
      filter={filter}
      onFilterChange={setFilter}
      query={query}
      onQueryChange={setQuery}
    >
      {filtered.length === 0 && <div className="s-empty">No beliefs match.</div>}
      {TIER_ORDER.map((tier) => {
        const group = grouped[tier];
        if (!group || group.length === 0) return null;
        return (
          <section key={tier}>
            <div className="s-tier-head">
              <span className="s-tier-name">{tier}</span>
              <span className="s-tier-count">{group.length}</span>
            </div>
            {group.map((b) => <BeliefRow key={b.id} belief={b} />)}
          </section>
        );
      })}
    </MnemosStreamShell>
  );
}
