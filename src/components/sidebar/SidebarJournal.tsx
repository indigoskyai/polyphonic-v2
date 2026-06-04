import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AgentScopeSelect from './AgentScopeSelect';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { buildNotebookItems, NOTEBOOK_FILTERS, type NotebookFilter } from '@/lib/notebook';

const SIDEBAR_FILTERS: Array<{ id: NotebookFilter; label: string }> = [
  { id: 'all', label: 'All notes' },
  { id: 'journal', label: 'Journal' },
  { id: 'thought', label: 'Thoughts' },
  { id: 'wandering', label: 'Wanderings' },
  { id: 'dream', label: 'Dreams' },
  { id: 'insight', label: 'Insights' },
  { id: 'reflection', label: 'Reflections' },
  { id: 'belief', label: 'Beliefs' },
  { id: 'activity', label: 'Activity' },
];

function isNotebookFilter(value: string | null): value is NotebookFilter {
  return !!value && NOTEBOOK_FILTERS.some((option) => option.id === value);
}

export default function SidebarJournal() {
  const location = useLocation();
  const navigate = useNavigate();
  const surfaceLabel = location.pathname.startsWith('/notebook') ? 'Notebook' : 'Journal';
  const requestedFilter = new URLSearchParams(location.search).get('view');
  const selectedFilter: NotebookFilter = isNotebookFilter(requestedFilter) ? requestedFilter : 'all';
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

  const countForFilter = (id: NotebookFilter): number => {
    if (id === 'all') return items.length;
    if (id === 'thought') return (counts.thought || 0) + (counts.question || 0);
    return counts[id] || 0;
  };

  const selectFilter = (id: NotebookFilter) => {
    const params = new URLSearchParams(location.search);
    if (id === 'all') {
      params.delete('view');
    } else {
      params.set('view', id);
    }
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true });
  };

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
        {SIDEBAR_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-item${selectedFilter === id ? ' active' : ''}`}
            onClick={() => selectFilter(id)}
            aria-pressed={selectedFilter === id}
          >
            <span className="sidebar-item-name"><span className="sidebar-item-glyph">·</span>{label}</span>
            <span className="sidebar-item-meta">{countForFilter(id)}</span>
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
