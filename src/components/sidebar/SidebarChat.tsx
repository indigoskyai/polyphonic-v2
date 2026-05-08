import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useThreadStore, type Thread } from '@/stores/threadStore';
import { useProjectStore, threadsForProject, sortProjects } from '@/stores/projectStore';
import SidebarHeader from './SidebarHeader';
import ThreadRow from './ThreadRow';
import { groupThreadsByDate } from '@/lib/threadGrouping';

// Collapse state per project — persisted to localStorage so it survives reloads.
const PROJECT_COLLAPSE_KEY = 'polyphonic:projectCollapse';
function loadCollapseState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PROJECT_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveCollapseState(state: Record<string, boolean>) {
  try { localStorage.setItem(PROJECT_COLLAPSE_KEY, JSON.stringify(state)); } catch { /* */ }
}

export default function SidebarChat() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Thread[]>([]);
  const { threads, currentThreadId, loadThreads } = useThreadStore();
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  // Collapse state for project groups — initial load is expanded by default
  // for new projects (they appear without a stored value), collapsed if user
  // previously collapsed them.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapseState);
  const toggleCollapsed = (projectId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [projectId]: !prev[projectId] };
      saveCollapseState(next);
      return next;
    });
  };

  useEffect(() => { loadThreads(); loadProjects(); }, [loadThreads, loadProjects]);

  useEffect(() => {
    if (!showArchived) { setArchived([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('threads')
        .select('*')
        .eq('archived', true)
        .order('updated_at', { ascending: false });
      if (!cancelled && data) setArchived(data as Thread[]);
    })();
    return () => { cancelled = true; };
  }, [showArchived, threads]);

  const q = search.trim().toLowerCase();
  const matches = (t: Thread) => !q || (t.title?.toLowerCase().includes(q) ?? false);

  const visible = threads.filter(matches);

  // Projects own their threads — threads inside a project appear ONLY under
  // their project group, not in pinned/starred/date-grouped. Keeps the top
  // of the list scannable.
  const inProject = (t: Thread) => !!t.project_id;
  const looseThreads = visible.filter((t) => !inProject(t));
  const pinned = looseThreads.filter((t) => t.pinned);
  const starred = looseThreads.filter((t) => !t.pinned && t.starred);
  const rest = looseThreads.filter((t) => !t.pinned && !t.starred);
  const dateGroups = useMemo(() => groupThreadsByDate(rest), [rest]);

  // Active (non-archived) projects that have at least one thread, sorted by
  // pinned-then-recent. Empty projects are hidden from the threads sidebar
  // (they live in the Projects view).
  const activeProjects = useMemo(() => {
    const eligible = projects.filter((p) => !p.archived);
    return sortProjects(eligible).filter((p) => threadsForProject(visible, p.id).length > 0);
  }, [projects, visible]);

  const renderThread = (t: Thread) => (
    <ThreadRow
      key={t.id}
      thread={t}
      active={t.id === currentThreadId}
      onClick={() => navigate(`/chat/${t.id}`)}
    />
  );

  return (
    <>
      <SidebarHeader folio="§ 01" title="Threads" />

      <div style={{ padding: '0 8px 8px' }}>
        <input
          aria-label="Search threads"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search threads..."
          className="w-full outline-none"
          style={{
            height: 34,
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: '1px solid var(--border-faint)',
            borderRadius: 8,
            padding: '0 12px',
            transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--sage-border-focus)';
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--sage-overlay-hover)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-faint)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        {/* Projects — collapsible groups, render at the top so saved projects
            are always reachable. Only shown when at least one project has
            threads matching the search. */}
        {activeProjects.length > 0 && (
          <>
            <SectionLabel>Projects</SectionLabel>
            {activeProjects.map((project) => {
              const projectThreads = threadsForProject(visible, project.id);
              const isCollapsed = collapsed[project.id] === true;
              return (
                <div key={project.id} style={{ marginBottom: 2 }}>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(project.id)}
                    className="w-full flex items-center cursor-pointer"
                    style={{
                      padding: '6px 10px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      gap: 8,
                      textAlign: 'left',
                      color: 'var(--text-secondary)',
                      transition: 'background var(--dur-fast) var(--ease-out)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--overlay-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    aria-expanded={!isCollapsed}
                    aria-label={`${project.name} (${projectThreads.length} ${projectThreads.length === 1 ? 'thread' : 'threads'})`}
                  >
                    {isCollapsed
                      ? <ChevronRight size={13} strokeWidth={1.6} style={{ flex: '0 0 13px', color: 'var(--text-tertiary)' }} />
                      : <ChevronDown size={13} strokeWidth={1.6} style={{ flex: '0 0 13px', color: 'var(--text-tertiary)' }} />}
                    <Folder size={15} strokeWidth={1.5} style={{ flex: '0 0 15px', color: 'var(--text-tertiary)' }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 15,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {project.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        letterSpacing: 'var(--track-folio)',
                        color: 'var(--text-whisper)',
                        fontVariantNumeric: 'tabular-nums',
                        flex: '0 0 auto',
                      }}
                    >
                      {projectThreads.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div style={{ paddingLeft: 14 }}>
                      {projectThreads.map(renderThread)}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {pinned.length > 0 && (
          <>
            <SectionLabel>Pinned</SectionLabel>
            {pinned.map(renderThread)}
          </>
        )}
        {starred.length > 0 && (
          <>
            <SectionLabel>Starred</SectionLabel>
            {starred.map(renderThread)}
          </>
        )}
        {dateGroups.map((group) => (
          <div key={group.key}>
            <SectionLabel>{group.label}</SectionLabel>
            {group.threads.map(renderThread)}
          </div>
        ))}

        {visible.length === 0 && (
          <div
            style={{
              padding: '14px 10px',
              fontSize: 13,
              color: 'var(--text-ghost)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {q ? 'No threads match your search.' : 'No conversations yet.'}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 w-full"
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: 'var(--track-meta)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
            }}
          >
            {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Archived
            {showArchived && archived.length > 0 && (
              <span style={{ marginLeft: 4, color: 'var(--text-tertiary)' }}>{archived.length}</span>
            )}
          </button>
          {showArchived && (
            <div>
              {archived.length === 0 && (
                <div style={{ padding: '6px 10px', fontSize: 13, color: 'var(--text-ghost)' }}>
                  Nothing archived.
                </div>
              )}
              {archived.filter(matches).map(renderThread)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
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
