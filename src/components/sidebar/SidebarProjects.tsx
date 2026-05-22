import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/stores/projectStore';
import { useThreadStore } from '@/stores/threadStore';
import SidebarHeader from './SidebarHeader';
import SidebarRow from './SidebarRow';

export default function SidebarProjects() {
  const navigate = useNavigate();
  const location = useLocation();
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const threads = useThreadStore((s) => s.threads);
  const loadThreads = useThreadStore((s) => s.loadThreads);
  const activeId = location.pathname.startsWith('/projects/')
    ? location.pathname.split('/')[2]
    : null;

  useEffect(() => {
    void loadProjects();
    void loadThreads();
  }, [loadProjects, loadThreads]);

  return (
    <>
      <SidebarHeader folio="§ 02" title="Projects" />

      <div style={{ padding: '0 8px 10px' }}>
        <button
          type="button"
          className="w-full"
          onClick={() => navigate('/projects')}
          style={{
            minHeight: 30,
            borderRadius: 8,
            border: '1px solid var(--border-faint)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            textAlign: 'left',
            padding: '0 12px',
          }}
        >
          New project or manage threads
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        <SectionLabel>Workspaces</SectionLabel>
        {loading && <SidebarNote>Loading projects...</SidebarNote>}
        {error && <SidebarNote tone="danger">{error}</SidebarNote>}
        {!loading && !error && projects.length === 0 && (
          <SidebarNote>Create a project to group threads and carry instructions into Luca.</SidebarNote>
        )}
        {projects.map((project) => {
          const count = threads.filter((thread) => thread.project_id === project.id).length;
          return (
            <SidebarRow
              key={project.id}
              label={project.name}
              active={activeId === project.id}
              count={count}
              onClick={() => navigate(`/projects/${project.id}`)}
            />
          );
        })}
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
        fontSize: 'var(--settings-mono-size)',
        fontWeight: 'var(--weight-medium)',
        letterSpacing: 'var(--track-folio)',
        color: 'var(--text-ghost)',
        padding: '14px 8px 6px',
      }}
    >
      {children}
    </div>
  );
}

function SidebarNote({ children, tone }: { children: React.ReactNode; tone?: 'danger' }) {
  return (
    <div
      style={{
        color: tone === 'danger' ? 'var(--danger)' : 'var(--text-ghost)',
        fontSize: 'var(--settings-caption-size)',
        fontWeight: 'var(--weight-book)',
        lineHeight: 1.55,
        padding: '8px 10px',
      }}
    >
      {children}
    </div>
  );
}
