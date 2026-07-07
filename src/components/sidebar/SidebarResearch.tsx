import { useNavigate } from 'react-router-dom';
import { Beaker, Database, Gauge, SearchCheck } from 'lucide-react';
import { getWellCatalogStats } from '@/lib/theWellCatalog';

const STARTER_QUERIES = [
  'smallest first probe',
  'shock fronts',
  'turbulence',
  'active matter',
];

export default function SidebarResearch() {
  const navigate = useNavigate();
  const stats = getWellCatalogStats();

  return (
    <div className="r2-sidebar">
      <div className="sidebar-head">
        <h2 className="sidebar-head-title">Research</h2>
      </div>

      <div style={{ padding: '0 8px 10px' }}>
        <button
          type="button"
          className="w-full"
          onClick={() => navigate('/research')}
          style={{
            minHeight: 32,
            borderRadius: 8,
            border: '1px solid var(--border-faint)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            textAlign: 'left',
            padding: '0 12px',
          }}
        >
          The Deep Well
        </button>
      </div>

      <div style={{ padding: '4px 8px 12px', display: 'grid', gap: 7 }}>
        <Stat icon={<Database size={13} />} label="Mapped" value={stats.totalSizeLabel} />
        <Stat icon={<Beaker size={13} />} label="Families" value={String(stats.familyCount)} />
        <Stat icon={<Gauge size={13} />} label="Access names" value={String(stats.variantCount)} />
      </div>

      <div className="sidebar-section-eye">
        Query seeds <span className="count">{STARTER_QUERIES.length}</span>
      </div>
      <div className="sidebar-list" style={{ flex: '0 0 auto' }}>
        {STARTER_QUERIES.map((query) => (
          <button key={query} type="button" className="sidebar-item" onClick={() => navigate('/research')}>
            <span className="sidebar-item-name">
              <span className="sidebar-item-glyph">·</span>{query}
            </span>
            <span className="sidebar-item-meta"><SearchCheck size={12} /></span>
          </button>
        ))}
      </div>

      <div className="sidebar-foot">
        <div className="sidebar-foot-row"><span>Default raw ingest</span><span className="v">0 GB</span></div>
        <div className="sidebar-foot-row"><span>Mode</span><span className="v">Pointer</span></div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minHeight: 32,
        padding: '0 10px',
        border: '1px solid var(--border-faint)',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.018)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, color: 'var(--text-ghost)', fontSize: 11 }}>
        {icon}
        <span>{label}</span>
      </span>
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{value}</span>
    </div>
  );
}
