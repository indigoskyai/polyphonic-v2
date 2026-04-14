import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryStore } from '@/stores/memoryStore';
import GraphTab from '@/components/memory/GraphTab';
import EngramsTab from '@/components/memory/EngramsTab';
import BeliefsTab from '@/components/memory/BeliefsTab';

const TABS = ['Graph', 'Engrams', 'Beliefs'] as const;
type Tab = typeof TABS[number];

export default function MemoryView() {
  const [activeTab, setActiveTab] = useState<Tab>('Graph');
  const user = useAuthStore((s) => s.user);
  const { loading, loadAll, selectedEngram, setSelectedEngram } = useMemoryStore();

  useEffect(() => {
    if (user) loadAll(user.id);
  }, [user]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{
        height: 44,
        padding: '0 24px',
        borderBottom: '1px solid var(--border-subtle)',
        gap: 20,
      }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          Memory
        </span>
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                height: 28,
                padding: '0 12px',
                fontSize: 11,
                fontWeight: activeTab === tab ? 500 : 400,
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-ghost)',
                background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
                border: activeTab === tab ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all var(--dur-fast) var(--ease-out)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        {loading && (
          <span style={{ fontSize: 10, color: 'var(--text-whisper)', marginLeft: 'auto' }}>loading...</span>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto" style={{
          padding: activeTab === 'Graph' ? 0 : '24px 32px',
        }}>
          {activeTab === 'Graph' && <GraphTab />}
          {activeTab === 'Engrams' && <EngramsTab />}
          {activeTab === 'Beliefs' && <BeliefsTab />}
        </div>

        {/* Detail panel (when engram selected) */}
        {selectedEngram && (
          <div style={{
            width: 320,
            borderLeft: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            overflow: 'auto',
            padding: '20px 16px',
            animation: 'viewFadeIn 0.2s var(--ease-out) both',
          }}>
            <div className="flex items-center justify-between mb-4">
              <span style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: selectedEngram.engram_type === 'episodic' ? '#5b8aad' :
                       selectedEngram.engram_type === 'semantic' ? '#c9a87c' :
                       selectedEngram.engram_type === 'procedural' ? '#8ca89c' : '#a88cc9',
              }}>
                {selectedEngram.engram_type}
              </span>
              <button
                onClick={() => setSelectedEngram(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-sans)' }}
              >
                ×
              </button>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {selectedEngram.content}
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {[
                { label: 'Strength', value: selectedEngram.strength },
                { label: 'Stability', value: selectedEngram.stability },
                { label: 'Accessibility', value: selectedEngram.accessibility },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <span style={{ fontSize: 10, color: 'var(--text-ghost)', width: 70 }}>{label}</span>
                  <div style={{ flex: 1, height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${value * 100}%`, height: '100%', background: 'var(--text-ghost)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 32 }}>
                    {value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>State</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{selectedEngram.state}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Accessed</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {selectedEngram.access_count}×
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Valence</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {selectedEngram.emotional_valence.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Created</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {new Date(selectedEngram.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {selectedEngram.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedEngram.tags.map((tag) => (
                  <span key={tag} style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 3,
                    background: 'var(--bg-deep)', color: 'var(--text-ghost)',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
