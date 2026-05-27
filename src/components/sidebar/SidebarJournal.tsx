import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import AgentScopeSelect from './AgentScopeSelect';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { buildNotebookItems } from '@/lib/notebook';

export default function SidebarJournal() {
  const location = useLocation();
  const surfaceLabel = location.pathname.startsWith('/notebook') ? 'Notebook' : 'Journal';
  const activeAgentName = useAgentScopeStore((s) => s.availableAgents.find((a) => a.id === s.activeAgentId)?.name ?? 'Luca');
  const {
    journalEntries,
    thoughts,
    dreams,
    insights,
    reflections,
    wanderings,
    beliefs,
    activityLog,
  } = useCognitiveStore();

  const items = useMemo(() => buildNotebookItems({
    journalEntries,
    thoughts,
    dreams,
    insights,
    reflections,
    wanderings,
    beliefs,
    activityLog,
  }), [activityLog, beliefs, dreams, insights, journalEntries, reflections, thoughts, wanderings]);

  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});
  const last = items[0];

  return (
    <div className="r2-sidebar">
      <div className="sidebar-head">
        <h2 className="sidebar-head-title">{surfaceLabel}</h2>
      </div>
      <AgentScopeSelect />

      <div className="sidebar-search">
        <span className="sidebar-search-glyph">⌕</span>
        <span className="sidebar-search-text">Search {surfaceLabel.toLowerCase()}…</span>
        <span className="sidebar-search-kbd">⌘K</span>
      </div>

      <div className="sidebar-section-eye">
        {surfaceLabel} <span className="count">{items.length}</span>
      </div>

      <div className="sidebar-list">
        {[
          ['All notes', items.length],
          ['Journal', counts.journal || 0],
          ['Thoughts', (counts.thought || 0) + (counts.question || 0)],
          ['Wanderings', counts.wandering || 0],
          ['Dreams', counts.dream || 0],
          ['Insights', counts.insight || 0],
          ['Reflections', counts.reflection || 0],
          ['Beliefs', counts.belief || 0],
          ['Activity', counts.activity || 0],
        ].map(([label, count], index) => (
          <button key={label} type="button" className={`sidebar-item${index === 0 ? ' active' : ''}`}>
            <span className="sidebar-item-name"><span className="sidebar-item-glyph">·</span>{label}</span>
            <span className="sidebar-item-meta">{count}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-foot">
        <div className="sidebar-foot-row"><span>Agent</span><span className="v">{activeAgentName}</span></div>
        <div className="sidebar-foot-row">
          <span>Last note</span>
          <span className="v">{last ? new Date(last.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
        </div>
      </div>
    </div>
  );
}
