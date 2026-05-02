import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useViewTabStore, MemoryTab } from '@/stores/viewTabStore';
import { useMemoryCandidatesStore } from '@/stores/memoryCandidatesStore';

interface NavItem { name: MemoryTab; meta: string; }

export default function SidebarMemory() {
  const user = useAuthStore((s) => s.user);
  const memories = useMemoryStore((s) => s.memories);
  const engrams = useMemoryStore((s) => s.engrams);
  const beliefs = useMemoryStore((s) => s.beliefs);
  const connections = useMemoryStore((s) => s.connections);
  const loadMemories = useMemoryStore((s) => s.loadMemories);
  const memoryTab = useViewTabStore((s) => s.memoryTab);
  const setMemoryTab = useViewTabStore((s) => s.setMemoryTab);
  const candidates = useMemoryCandidatesStore((s) => s.items);

  useEffect(() => {
    if (user && memories.length === 0) loadMemories(user.id);
  }, [user]);

  const counts = useMemo(() => {
    const activeEngrams = engrams.filter((e) => e.state === 'active' || e.state === 'consolidating').length;
    return {
      memories: memories.length,
      engrams: activeEngrams,
      beliefs: beliefs.length,
      graph: `${activeEngrams}·${connections.length}`,
      candidates: candidates.length,
    };
  }, [memories, engrams, beliefs, connections, candidates]);

  const items: NavItem[] = [
    { name: 'Memories', meta: counts.candidates > 0 ? `${counts.candidates} new` : String(counts.memories) },
    { name: 'Engrams',  meta: String(counts.engrams) },
    { name: 'Beliefs',  meta: String(counts.beliefs) },
    { name: 'Graph',    meta: counts.graph },
    { name: 'Imports',  meta: '—' /* MOCK: import count not wired */ },
    { name: 'Settings', meta: '·' },
  ];

  return (
    <div className="r2-sidebar">
      <div className="sidebar-head">
        <div className="sidebar-eye">View · Mnemos</div>
        <h2 className="sidebar-head-title">Memory</h2>
      </div>

      <div className="sidebar-search">
        <span className="sidebar-search-glyph">⌕</span>
        <span className="sidebar-search-text">Search the substrate…</span>
        <span className="sidebar-search-kbd">⌘K</span>
      </div>

      <div className="sidebar-section-eye">
        Sections <span className="count">{items.length}</span>
      </div>

      <div className="sidebar-list">
        {items.map((it) => {
          const active = memoryTab === it.name;
          return (
            <button
              key={it.name}
              type="button"
              className={`sidebar-item${active ? ' active' : ''}`}
              onClick={() => setMemoryTab(it.name)}
            >
              <span className="sidebar-item-name">
                <span className="sidebar-item-glyph">·</span>{it.name}
              </span>
              <span className="sidebar-item-meta">{it.meta}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-foot">
        {/* MOCK: substrate health + last-decay timestamps until wired */}
        <div className="sidebar-foot-row"><span>Substrate</span><span className="v">healthy</span></div>
        <div className="sidebar-foot-row"><span>Last decay</span><span className="v">6h ago</span></div>
        <div className="sidebar-foot-row"><span>Consolidating</span><span className="v">{engrams.filter(e => e.state === 'consolidating').length}</span></div>
      </div>
    </div>
  );
}
