import { useViewTabStore, MindTab } from '@/stores/viewTabStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';

interface NavItem { name: MindTab; meta: string; }

export default function SidebarMind() {
  const mindTab = useViewTabStore((s) => s.mindTab);
  const setMindTab = useViewTabStore((s) => s.setMindTab);
  const { thoughts, dreams, wanderings, insights, reflections, activityLog, memoryStats } = useCognitiveStore();

  const items: NavItem[] = [
    { name: 'Overview',    meta: 'live' },
    { name: 'Thoughts',    meta: String(thoughts.length) },
    { name: 'Dreams',      meta: String(dreams.length) },
    { name: 'Wanderings',  meta: String(wanderings.length) },
    { name: 'Insights',    meta: String(insights.length) },
    { name: 'Reflections', meta: String(reflections.length) },
    { name: 'Beliefs',     meta: String(memoryStats.beliefs_count) },
    { name: 'Activity',    meta: String(activityLog.length) },
  ];

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
        Sections <span className="count">{items.length}</span>
      </div>

      <div className="sidebar-list">
        {items.map((it) => {
          const active = mindTab === it.name;
          return (
            <button
              key={it.name}
              type="button"
              className={`sidebar-item${active ? ' active' : ''}`}
              onClick={() => setMindTab(it.name)}
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
        {/* MOCK: synced/substrate/last-consol values until wired */}
        <div className="sidebar-foot-row"><span>Synced</span><span className="v">2 min ago</span></div>
        <div className="sidebar-foot-row"><span>Substrate</span><span className="v">ticking</span></div>
        <div className="sidebar-foot-row"><span>Last consol.</span><span className="v">3h ago</span></div>
      </div>
    </div>
  );
}
