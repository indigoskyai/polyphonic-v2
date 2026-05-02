import { useViewTabStore, MindTab } from '@/stores/viewTabStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';

const TABS: { name: MindTab; meta?: string; countKey?: 'thoughts' | 'dreams' | 'wanderings' | 'insights' | 'reflections' | 'beliefs' | 'activity' }[] = [
  { name: 'Overview', meta: 'live' },
  { name: 'Thoughts', countKey: 'thoughts' },
  { name: 'Dreams', countKey: 'dreams' },
  { name: 'Wanderings', countKey: 'wanderings' },
  { name: 'Insights', countKey: 'insights' },
  { name: 'Reflections', countKey: 'reflections' },
  // Journal kept in nav but rendered as 'Beliefs' label per reference (existing route).
];

export default function SidebarMind() {
  const mindTab = useViewTabStore((s) => s.mindTab);
  const setMindTab = useViewTabStore((s) => s.setMindTab);
  const { thoughts, dreams, wanderings, insights, reflections, activityLog, memoryStats } = useCognitiveStore();

  const counts = {
    thoughts: thoughts.length,
    dreams: dreams.length,
    wanderings: wanderings.length,
    insights: insights.length,
    reflections: reflections.length,
    beliefs: memoryStats.beliefs_count,
    activity: activityLog.length,
  };

  // Reference shows: Overview / Thoughts / Dreams / Wanderings / Insights / Reflections / Beliefs / Activity (8)
  // We map "Beliefs" + "Activity" to existing tabs (Journal route reused for now).
  const items: { name: MindTab; label: string; meta: string; active: boolean; onClick: () => void }[] = [
    { name: 'Overview', label: 'Overview', meta: mindTab === 'Overview' ? 'live' : 'live', active: mindTab === 'Overview', onClick: () => setMindTab('Overview') },
    { name: 'Thoughts', label: 'Thoughts', meta: String(counts.thoughts), active: mindTab === 'Thoughts', onClick: () => setMindTab('Thoughts') },
    { name: 'Dreams', label: 'Dreams', meta: String(counts.dreams), active: mindTab === 'Dreams', onClick: () => setMindTab('Dreams') },
    { name: 'Wanderings', label: 'Wanderings', meta: String(counts.wanderings), active: mindTab === 'Wanderings', onClick: () => setMindTab('Wanderings') },
    { name: 'Insights', label: 'Insights', meta: String(counts.insights), active: mindTab === 'Insights', onClick: () => setMindTab('Insights') },
    { name: 'Reflections', label: 'Reflections', meta: String(counts.reflections), active: mindTab === 'Reflections', onClick: () => setMindTab('Reflections') },
    // MOCK: Beliefs + Activity tabs route to Journal until dedicated views exist.
    { name: 'Journal', label: 'Beliefs', meta: String(counts.beliefs), active: mindTab === 'Journal', onClick: () => setMindTab('Journal') },
    { name: 'Journal', label: 'Activity', meta: String(counts.activity), active: false, onClick: () => setMindTab('Journal') },
  ];

  void TABS; // silence unused

  return (
    <div className="r2-sidebar">
      <div className="sidebar-head">
        <div className="sidebar-eye">View · Mind</div>
        <h2 className="sidebar-head-title">Mind</h2>
      </div>

      <div className="sidebar-search">
        <span className="sidebar-search-glyph">⌕</span>
        <span className="sidebar-search-text">Search the inner life…</span>
        <span className="sidebar-search-kbd">⌘K</span>
      </div>

      <div className="sidebar-section-eye">
        Sections <span className="count">8</span>
      </div>

      <div className="sidebar-list">
        {items.map((it, i) => (
          <button
            key={it.label + i}
            type="button"
            className={`sidebar-item${it.active ? ' active' : ''}`}
            onClick={it.onClick}
          >
            <span className="sidebar-item-name">
              <span className="sidebar-item-glyph">·</span>{it.label}
            </span>
            <span className="sidebar-item-meta">{it.meta}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-foot">
        {/* MOCK: synced/substrate/last-consol values until wired */}
        <div className="sidebar-foot-row"><span>Synced</span><span className="v">2 min ago</span></div>
        <div className="sidebar-foot-row"><span>Substrate</span><span className="v">ticking</span></div>
        <div className="sidebar-foot-row"><span>Last consol.</span><span className="v">3h ago</span></div>
      </div>
    </div>
  );
}
