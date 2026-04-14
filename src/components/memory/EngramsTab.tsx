import { useMemo } from 'react';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';

const TYPE_COLORS: Record<string, string> = {
  episodic: '#5b8aad',
  semantic: '#c9a87c',
  procedural: '#8ca89c',
  belief: '#a88cc9',
};

function StrengthBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 10 }}>
      <span style={{ color: 'var(--text-ghost)', width: 20, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${value * 100}%`, height: '100%', background: 'var(--text-ghost)', borderRadius: 2, transition: 'width 0.3s var(--ease-out)' }} />
      </div>
      <span style={{ color: 'var(--text-whisper)', width: 28, fontFamily: 'var(--font-mono)' }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function EngramCard({ engram, onClick }: { engram: Engram; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'border-color var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{
          fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
          padding: '1px 6px', borderRadius: 100,
          color: TYPE_COLORS[engram.engram_type] || 'var(--text-ghost)',
          border: `1px solid ${TYPE_COLORS[engram.engram_type] || 'var(--border)'}40`,
        }}>
          {engram.engram_type}
        </span>
        <span style={{
          fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: engram.state === 'active' ? 'var(--text-ghost)' : 'var(--text-whisper)',
        }}>
          {engram.state}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
          {new Date(engram.created_at).toLocaleDateString()}
        </span>
      </div>

      <div style={{
        fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        marginBottom: 10,
      }}>
        {engram.content}
      </div>

      <div className="flex flex-col gap-1">
        <StrengthBar value={engram.strength} label="S" />
        <StrengthBar value={engram.stability} label="T" />
        <StrengthBar value={engram.accessibility} label="A" />
      </div>

      {engram.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {engram.tags.slice(0, 5).map((tag) => (
            <span key={tag} style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 3,
              background: 'var(--bg-deep)', color: 'var(--text-ghost)',
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EngramsTab() {
  const { engrams, filters, setFilters, setSelectedEngram } = useMemoryStore();

  const filtered = useMemo(() => {
    let list = [...engrams];
    if (filters.engram_type) list = list.filter((e) => e.engram_type === filters.engram_type);
    if (filters.state) list = list.filter((e) => e.state === filters.state);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((e) => e.content.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)));
    }
    switch (filters.sort) {
      case 'strength': list.sort((a, b) => b.strength - a.strength); break;
      case 'stability': list.sort((a, b) => b.stability - a.stability); break;
      case 'access_count': list.sort((a, b) => b.access_count - a.access_count); break;
      default: list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [engrams, filters]);

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search engrams..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          style={{
            height: 32, width: 200, background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 12, color: 'var(--text-primary)',
            outline: 'none', fontFamily: 'var(--font-sans)',
          }}
        />
        <select
          value={filters.engram_type || ''}
          onChange={(e) => setFilters({ engram_type: e.target.value || null })}
          style={{ height: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 11, color: 'var(--text-secondary)', outline: 'none' }}
        >
          <option value="">All types</option>
          <option value="episodic">Episodic</option>
          <option value="semantic">Semantic</option>
          <option value="procedural">Procedural</option>
          <option value="belief">Belief</option>
        </select>
        <select
          value={filters.state || ''}
          onChange={(e) => setFilters({ state: e.target.value || null })}
          style={{ height: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 11, color: 'var(--text-secondary)', outline: 'none' }}
        >
          <option value="">All states</option>
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
          <option value="consolidating">Consolidating</option>
        </select>
        <select
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as any })}
          style={{ height: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 11, color: 'var(--text-secondary)', outline: 'none' }}
        >
          <option value="recency">Recent</option>
          <option value="strength">Strength</option>
          <option value="stability">Stability</option>
          <option value="access_count">Access count</option>
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length} engrams
        </span>
      </div>

      {/* Engram list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-ghost)', fontSize: 12 }}>
            No engrams found
          </div>
        )}
        {filtered.map((engram) => (
          <EngramCard key={engram.id} engram={engram} onClick={() => setSelectedEngram(engram)} />
        ))}
      </div>
    </div>
  );
}
