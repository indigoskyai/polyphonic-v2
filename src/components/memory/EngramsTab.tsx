/**
 * EngramsTab — Round 2.
 * Wrapped in MnemosStreamShell with ALL/RECENT/SALIENT filter, sort selector,
 * and engram cards rendered in the s-row aesthetic with strength/stability/access bars.
 */
import { useMemo, useState } from 'react';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';
import { useDrawerStore } from '@/stores/drawerStore';
import MnemosStreamShell, { type StreamFilter } from './MnemosStreamShell';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function EngramRow({ engram, selected, onClick }: { engram: Engram; selected: boolean; onClick: () => void }) {
  return (
    <div
      className={`s-row s-engram${selected ? ' selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="s-row-meta">
        <span className="dot" />
        <span className="s-type-chip" data-state={engram.state}>{engram.engram_type}</span>
        <span className="kind">{engram.state}</span>
        {engram.access_count > 0 && (
          <span className="kind">accessed {engram.access_count}×</span>
        )}
        {engram.content_integrity_status === 'suspect' && (
          <span className="integrity-suspect" title={engram.content_integrity_reason || 'Possible legacy truncation'}>
            review
          </span>
        )}
        <span className="salience">{engram.strength.toFixed(2)}</span>
        <span className="time">{timeAgo(engram.created_at)}</span>
      </div>
      <div className="s-row-content">{engram.content}</div>
      <div className="s-bars">
        <div className="s-bar">
          <span className="s-bar-label">str</span>
          <div className="s-bar-track"><div className="s-bar-fill" style={{ width: `${engram.strength * 100}%` }} /></div>
          <span className="s-bar-val">{engram.strength.toFixed(2)}</span>
        </div>
        <div className="s-bar">
          <span className="s-bar-label">stb</span>
          <div className="s-bar-track"><div className="s-bar-fill" style={{ width: `${engram.stability * 100}%` }} /></div>
          <span className="s-bar-val">{engram.stability.toFixed(2)}</span>
        </div>
        <div className="s-bar">
          <span className="s-bar-label">acc</span>
          <div className="s-bar-track"><div className="s-bar-fill" style={{ width: `${engram.accessibility * 100}%` }} /></div>
          <span className="s-bar-val">{engram.accessibility.toFixed(2)}</span>
        </div>
      </div>
      {engram.tags.length > 0 && (
        <div className="s-row-tags">
          {engram.tags.slice(0, 6).map((t, index) => (
            <span key={`${t}-${index}`} className="s-row-tag">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EngramsTab() {
  const { engrams, selectedEngram, setSelectedEngram } = useMemoryStore();
  const openDrawer = useDrawerStore((s) => s.open);
  const [filter, setFilter] = useState<StreamFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recency' | 'strength' | 'stability' | 'access_count'>('recency');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const filtered = useMemo(() => {
    let list = engrams.filter((e) => e.state === 'active' || e.state === 'consolidating');

    if (typeFilter) list = list.filter((e) => e.engram_type === typeFilter);

    if (filter === 'recent') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((e) => new Date(e.created_at).getTime() >= cutoff);
    } else if (filter === 'salient') {
      list = list.filter((e) => e.strength >= 0.6);
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter((e) => e.content.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)));
    }

    switch (sort) {
      case 'strength': list = [...list].sort((a, b) => b.strength - a.strength); break;
      case 'stability': list = [...list].sort((a, b) => b.stability - a.stability); break;
      case 'access_count': list = [...list].sort((a, b) => b.access_count - a.access_count); break;
      default: list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [engrams, filter, query, sort, typeFilter]);

  const toolbarExtra = (
    <>
      <select
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value)}
        className="s-segment-btn"
        style={{
          height: 38, padding: '0 14px', borderRadius: 999,
          background: 'var(--surface-1)', border: '1px solid var(--border-faint)',
          color: typeFilter ? 'var(--text-primary)' : 'var(--text-whisper)',
          cursor: 'pointer', appearance: 'none',
        }}
      >
        <option value="">all types</option>
        <option value="episodic">episodic</option>
        <option value="semantic">semantic</option>
        <option value="procedural">procedural</option>
        <option value="belief">belief</option>
      </select>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as typeof sort)}
        className="s-segment-btn"
        style={{
          height: 38, padding: '0 14px', borderRadius: 999,
          background: 'var(--surface-1)', border: '1px solid var(--border-faint)',
          color: 'var(--text-soft)', cursor: 'pointer', appearance: 'none',
        }}
      >
        <option value="recency">recent</option>
        <option value="strength">strength</option>
        <option value="stability">stability</option>
        <option value="access_count">accessed</option>
      </select>
    </>
  );

  return (
    <MnemosStreamShell
      num="02"
      streamLabel="ENGRAMS STREAM"
      title="Engrams"
      subtitle={`${filtered.length} engram${filtered.length === 1 ? '' : 's'}. The substrate's atomic units — strength · stability · accessibility.`}
      searchPlaceholder="Search engrams…"
      filter={filter}
      onFilterChange={setFilter}
      query={query}
      onQueryChange={setQuery}
      toolbarExtra={toolbarExtra}
    >
      <div className="s-list">
        {filtered.length === 0 && <div className="s-empty">No engrams match.</div>}
        {filtered.map((e) => (
          <EngramRow
            key={e.id}
            engram={e}
            selected={selectedEngram?.id === e.id}
            onClick={() => { setSelectedEngram(e); openDrawer('memory-detail', { engramId: e.id }); }}
          />
        ))}
      </div>
    </MnemosStreamShell>
  );
}
