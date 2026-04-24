import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useViewTabStore, MemoryTab } from '@/stores/viewTabStore';
import SidebarHeader from './SidebarHeader';
import SidebarRow from './SidebarRow';

const TYPE_LABELS: Record<string, string> = {
  fact: 'Facts',
  preference: 'Preferences',
  principle: 'Principles',
  commitment: 'Commitments',
  goal: 'Goals',
  context: 'Context',
  decision: 'Decisions',
  insight: 'Insights',
  moment: 'Moments',
  relationship: 'Relationships',
  skill: 'Skills',
};

const TYPE_ORDER = ['fact', 'preference', 'principle', 'commitment', 'goal', 'context', 'decision', 'insight', 'moment', 'relationship', 'skill'];

const SUBVIEWS: MemoryTab[] = ['Memories', 'Engrams', 'Beliefs', 'Graph', 'Imports', 'Settings'];

export default function SidebarMemory() {
  const user = useAuthStore((s) => s.user);
  const memories = useMemoryStore((s) => s.memories);
  const loadMemories = useMemoryStore((s) => s.loadMemories);
  const memoryTab = useViewTabStore((s) => s.memoryTab);
  const setMemoryTab = useViewTabStore((s) => s.setMemoryTab);
  const typeFilter = useViewTabStore((s) => s.memoryTypeFilter);
  const setTypeFilter = useViewTabStore((s) => s.setMemoryTypeFilter);
  const pinnedOnly = useViewTabStore((s) => s.memoryPinnedOnly);
  const setPinnedOnly = useViewTabStore((s) => s.setMemoryPinnedOnly);

  useEffect(() => {
    if (user && memories.length === 0) loadMemories(user.id);
  }, [user]);

  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    let pinned = 0;
    for (const m of memories) {
      byType[m.memory_type] = (byType[m.memory_type] || 0) + 1;
      if (m.is_pinned) pinned++;
    }
    return { total: memories.length, byType, pinned };
  }, [memories]);

  const typesPresent = TYPE_ORDER.filter((t) => counts.byType[t] > 0);

  return (
    <>
      <SidebarHeader folio="§ 02" title="Memory" />

      {/* Sub-view nav */}
      <div style={{ padding: '0 8px 8px' }}>
        {SUBVIEWS.map((sv) => (
          <SidebarRow
            key={sv}
            label={sv}
            active={memoryTab === sv}
            onClick={() => {
              setMemoryTab(sv);
              // When switching sub-views, clear the category filter so it doesn't carry over
              if (sv !== 'Memories') {
                setTypeFilter(null);
                setPinnedOnly(false);
              }
            }}
          />
        ))}
      </div>

      {/* Category filters — only when viewing Memories */}
      {memoryTab === 'Memories' && (
        <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px 16px', scrollbarWidth: 'none' }}>
          <SectionLabel>Filter</SectionLabel>
          <SidebarRow
            label="All"
            active={!typeFilter && !pinnedOnly}
            count={counts.total}
            onClick={() => { setTypeFilter(null); setPinnedOnly(false); }}
          />
          {counts.pinned > 0 && (
            <SidebarRow
              label="Pinned"
              active={pinnedOnly}
              count={counts.pinned}
              onClick={() => { setPinnedOnly(true); setTypeFilter(null); }}
            />
          )}
          {typesPresent.length > 0 && <SectionLabel>By type</SectionLabel>}
          {typesPresent.map((t) => (
            <SidebarRow
              key={t}
              label={TYPE_LABELS[t] || t}
              active={typeFilter === t && !pinnedOnly}
              count={counts.byType[t]}
              onClick={() => { setTypeFilter(t); setPinnedOnly(false); }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: 'var(--track-meta)',
        color: 'var(--text-ghost)',
        padding: '14px 8px 6px',
      }}
    >
      {children}
    </div>
  );
}
