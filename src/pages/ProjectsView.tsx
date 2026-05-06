import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, FolderKanban, MessageCircle, Plus, Save, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore, threadsForProject, type Project } from '@/stores/projectStore';
import { useThreadStore, type Thread } from '@/stores/threadStore';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

function threadTitle(thread: Thread) {
  return thread.title || 'New conversation';
}

function formatProjectDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export default function ProjectsView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const projectsLoading = useProjectStore((s) => s.loading);
  const projectsError = useProjectStore((s) => s.error);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const archiveProject = useProjectStore((s) => s.archiveProject);
  const createProjectThread = useProjectStore((s) => s.createProjectThread);
  const assignThread = useProjectStore((s) => s.assignThread);
  const threads = useThreadStore((s) => s.threads);
  const loadThreads = useThreadStore((s) => s.loadThreads);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const selected = useMemo(
    () => projects.find((project) => project.id === projectId) || projects[0] || null,
    [projectId, projects],
  );
  const [draft, setDraft] = useState({ name: '', description: '', instructions: '' });

  useEffect(() => {
    void loadProjects();
    void loadThreads();
  }, [loadProjects, loadThreads]);

  useEffect(() => {
    if (!projectId && projects[0]) {
      navigate(`/projects/${projects[0].id}`, { replace: true });
    }
  }, [navigate, projectId, projects]);

  useEffect(() => {
    setDraft({
      name: selected?.name || '',
      description: selected?.description || '',
      instructions: selected?.instructions || '',
    });
  }, [selected?.id]);

  const selectedThreads = selected ? threadsForProject(threads, selected.id) : [];
  const q = threadSearch.trim().toLowerCase();
  const availableThreads = threads
    .filter((thread) => !thread.project_id)
    .filter((thread) => !q || threadTitle(thread).toLowerCase().includes(q))
    .slice(0, 40);

  async function handleCreateProject() {
    if (!user) return;
    try {
      const project = await createProject(user.id, { name: newName });
      setNewName('');
      setCreating(false);
      navigate(`/projects/${project.id}`);
    } catch (error) {
      toast({
        title: 'Project not created',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleSaveProject() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateProject(selected.id, draft);
      toast({ title: 'Project saved' });
    } catch (error) {
      toast({
        title: 'Project not saved',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleNewProjectThread() {
    if (!user || !selected) return;
    try {
      const id = await createProjectThread(user.id, selected.id);
      navigate(`/chat/${id}`);
    } catch (error) {
      toast({
        title: 'Thread not created',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function moveThread(threadId: string, targetProjectId: string | null) {
    try {
      await assignThread(threadId, targetProjectId);
    } catch (error) {
      toast({
        title: 'Thread not moved',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleArchiveProject(project: Project) {
    try {
      await archiveProject(project.id);
      navigate('/projects', { replace: true });
    } catch (error) {
      toast({
        title: 'Project not archived',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="profile-page-frame" style={{ padding: isMobile ? '28px 20px 96px' : '44px 48px 80px', maxWidth: 1180 }}>
        <div className="flex items-start justify-between gap-6" style={{ marginBottom: 34, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 'var(--track-mono)',
                color: 'var(--text-ghost)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              § 02 / projects
            </div>
            <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 34 : 42, lineHeight: 1 }}>Projects</h1>
            <p style={{ margin: '14px 0 0', maxWidth: 620, color: 'var(--text-tertiary)', fontSize: 14, lineHeight: 1.7 }}>
              Organize threads into focused workspaces. Project instructions are carried into Luca&apos;s runtime when a thread belongs to the project.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={15} />
            <span>New project</span>
          </button>
        </div>

        {creating && (
          <section style={panelStyle}>
            <label style={labelStyle} htmlFor="new-project-name">Project name</label>
            <div className="flex gap-2">
              <input
                id="new-project-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreateProject();
                  if (event.key === 'Escape') setCreating(false);
                }}
                autoFocus
                placeholder="Product launch, thesis, client work..."
                style={inputStyle}
              />
              <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setCreating(false)}><X size={15} /></button>
              <button type="button" className="icon-btn" aria-label="Create project" onClick={handleCreateProject} disabled={!newName.trim()}><Plus size={15} /></button>
            </div>
          </section>
        )}

        <div className="grid gap-8" style={{ gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(250px, 320px) minmax(0, 1fr)' }}>
          <aside style={{ minWidth: 0 }}>
            <div style={panelStyle}>
              <div style={sectionLabelStyle}>Active projects</div>
              {projectsLoading ? (
                <p style={emptyStyle}>Loading projects...</p>
              ) : projectsError ? (
                <p style={errorStyle}>{projectsError}</p>
              ) : projects.length === 0 ? (
                <p style={emptyStyle}>No projects yet. Create one to start grouping threads.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => navigate(`/projects/${project.id}`)}
                      style={{
                        ...projectRowStyle,
                        borderColor: selected?.id === project.id ? 'var(--border-focus)' : 'var(--border-faint)',
                        background: selected?.id === project.id ? 'var(--surface-raised)' : 'transparent',
                      }}
                    >
                      <FolderKanban size={15} strokeWidth={1.7} />
                      <span className="min-w-0">
                        <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {project.name}
                        </span>
                        <span style={{ display: 'block', color: 'var(--text-ghost)', fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                          {formatProjectDate(project.updated_at)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main style={{ minWidth: 0 }}>
            {!selected ? (
              <section style={panelStyle}>
                <p style={emptyStyle}>Create a project to add instructions and organize threads.</p>
              </section>
            ) : (
              <div className="flex flex-col gap-6">
                <section style={panelStyle}>
                  <div className="flex items-center justify-between gap-4" style={{ marginBottom: 18 }}>
                    <div>
                      <div style={sectionLabelStyle}>Project brief</div>
                      <h2 style={{ margin: '6px 0 0', color: 'var(--text-primary)', fontSize: 22 }}>{selected.name}</h2>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="icon-btn" aria-label="Archive project" title="Archive project" onClick={() => handleArchiveProject(selected)}>
                        <Archive size={15} />
                      </button>
                      <button type="button" className="btn-primary" onClick={handleSaveProject} disabled={saving}>
                        <Save size={14} />
                        <span>{saving ? 'Saving...' : 'Save'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <label className="grid gap-2">
                      <span style={labelStyle}>Name</span>
                      <input value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} style={inputStyle} />
                    </label>
                    <label className="grid gap-2">
                      <span style={labelStyle}>Description</span>
                      <textarea
                        value={draft.description}
                        onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
                        rows={3}
                        style={textareaStyle}
                        placeholder="What this project is for."
                      />
                    </label>
                    <label className="grid gap-2">
                      <span style={labelStyle}>Project instructions</span>
                      <textarea
                        value={draft.instructions}
                        onChange={(event) => setDraft((d) => ({ ...d, instructions: event.target.value }))}
                        rows={8}
                        style={textareaStyle}
                        placeholder="How Luca and project agents should approach work inside this project."
                      />
                    </label>
                  </div>
                </section>

                <section style={panelStyle}>
                  <div className="flex items-center justify-between gap-4" style={{ marginBottom: 16 }}>
                    <div>
                      <div style={sectionLabelStyle}>Project threads</div>
                      <p style={{ margin: '6px 0 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        {selectedThreads.length} thread{selectedThreads.length === 1 ? '' : 's'} in this workspace.
                      </p>
                    </div>
                    <button type="button" className="btn-primary" onClick={handleNewProjectThread}>
                      <MessageCircle size={14} />
                      <span>New chat</span>
                    </button>
                  </div>

                  {selectedThreads.length === 0 ? (
                    <p style={emptyStyle}>No threads assigned yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedThreads.map((thread) => (
                        <ThreadProjectRow
                          key={thread.id}
                          thread={thread}
                          actionLabel="Remove"
                          onOpen={() => navigate(`/chat/${thread.id}`)}
                          onAction={() => moveThread(thread.id, null)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section style={panelStyle}>
                  <div style={sectionLabelStyle}>Add existing thread</div>
                  <input
                    aria-label="Search unassigned threads"
                    value={threadSearch}
                    onChange={(event) => setThreadSearch(event.target.value)}
                    placeholder="Search unassigned threads..."
                    style={{ ...inputStyle, margin: '12px 0' }}
                  />
                  {availableThreads.length === 0 ? (
                    <p style={emptyStyle}>No unassigned matching threads.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {availableThreads.map((thread) => (
                        <ThreadProjectRow
                          key={thread.id}
                          thread={thread}
                          actionLabel="Add"
                          onOpen={() => navigate(`/chat/${thread.id}`)}
                          onAction={() => moveThread(thread.id, selected.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function ThreadProjectRow({
  thread,
  actionLabel,
  onOpen,
  onAction,
}: {
  thread: Thread;
  actionLabel: string;
  onOpen: () => void;
  onAction: () => void;
}) {
  return (
    <div style={threadRowStyle}>
      <button type="button" onClick={onOpen} style={threadOpenStyle}>
        <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{threadTitle(thread)}</span>
        <span style={{ color: 'var(--text-ghost)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>{formatProjectDate(thread.updated_at)}</span>
      </button>
      <button type="button" onClick={onAction} style={smallButtonStyle}>{actionLabel}</button>
    </div>
  );
}

const panelStyle: CSSProperties = {
  borderTop: '1px solid var(--border-faint)',
  paddingTop: 18,
  marginBottom: 22,
};

const sectionLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 'var(--track-meta)',
  color: 'var(--text-ghost)',
  textTransform: 'uppercase',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 'var(--track-meta)',
  color: 'var(--text-ghost)',
  textTransform: 'uppercase',
};

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 36,
  borderRadius: 8,
  border: '1px solid var(--border-faint)',
  background: 'var(--surface-muted)',
  color: 'var(--text-primary)',
  padding: '0 12px',
  outline: 'none',
  fontSize: 13,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: undefined,
  padding: 12,
  resize: 'vertical',
  lineHeight: 1.6,
};

const projectRowStyle: CSSProperties = {
  width: '100%',
  display: 'grid',
  gridTemplateColumns: '18px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'start',
  textAlign: 'left',
  borderRadius: 8,
  border: '1px solid var(--border-faint)',
  padding: '10px 11px',
  color: 'var(--text-tertiary)',
};

const threadRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
  alignItems: 'center',
  border: '1px solid var(--border-faint)',
  borderRadius: 8,
  padding: 10,
};

const threadOpenStyle: CSSProperties = {
  minWidth: 0,
  textAlign: 'left',
  display: 'grid',
  gap: 4,
};

const smallButtonStyle: CSSProperties = {
  border: '1px solid var(--border-faint)',
  borderRadius: 8,
  color: 'var(--text-tertiary)',
  padding: '6px 10px',
  fontSize: 12,
};

const emptyStyle: CSSProperties = {
  color: 'var(--text-ghost)',
  fontSize: 13,
  lineHeight: 1.65,
};

const errorStyle: CSSProperties = {
  color: 'var(--danger)',
  fontSize: 13,
  lineHeight: 1.65,
};
