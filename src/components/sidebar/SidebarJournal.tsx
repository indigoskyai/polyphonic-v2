/**
 * SidebarJournal — minimal sidebar for the Journal view.
 * Single section for now; reserved space for future filters (mood, trigger, period).
 */
import AgentScopeSelect from './AgentScopeSelect';

export default function SidebarJournal() {
  return (
    <div className="r2-sidebar">
      <div className="sidebar-head">
        <h2 className="sidebar-head-title">Journal</h2>
      </div>
      <AgentScopeSelect />

      <div className="sidebar-search">
        <span className="sidebar-search-glyph">⌕</span>
        <span className="sidebar-search-text">Search journal…</span>
        <span className="sidebar-search-kbd">⌘K</span>
      </div>

      <div className="sidebar-section-eye">
        Filters <span className="count">3</span>
      </div>

      <div className="sidebar-list">
        <button type="button" className="sidebar-item active">
          <span className="sidebar-item-name"><span className="sidebar-item-glyph">·</span>All entries</span>
          <span className="sidebar-item-meta">live</span>
        </button>
        <button type="button" className="sidebar-item">
          <span className="sidebar-item-name"><span className="sidebar-item-glyph">·</span>Scheduled</span>
          <span className="sidebar-item-meta">—</span>
        </button>
        <button type="button" className="sidebar-item">
          <span className="sidebar-item-name"><span className="sidebar-item-glyph">·</span>Post-conversation</span>
          <span className="sidebar-item-meta">—</span>
        </button>
      </div>

      <div className="sidebar-foot">
        {/* MOCK */}
        <div className="sidebar-foot-row"><span>Last entry</span><span className="v">—</span></div>
        <div className="sidebar-foot-row"><span>Cadence</span><span className="v">periodic</span></div>
      </div>
    </div>
  );
}
