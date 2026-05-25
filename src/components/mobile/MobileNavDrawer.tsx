import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
  Bot,
  Brain,
  ChevronRight,
  CircleUserRound,
  FolderKanban,
  MessageCircle,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useAuthStore } from '@/stores/authStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useMobileShellStore } from '@/stores/mobileShellStore';
import { useNotificationStore, selectPendingInitiationsCount } from '@/stores/notificationStore';
import { useThreadStore, type Thread } from '@/stores/threadStore';

// Primary surfaces — mirrors the desktop nav rail (Chat, Memory, Mind, Journal,
// Projects, Profile). The old mobile list carried Group (a dev-only mock),
// Workspace and Checkpoints — none of which are in the web nav — and was
// missing Journal.
const PRIMARY_ROUTES = [
  { label: 'Chat', path: '/chat', icon: MessageCircle },
  { label: 'Memory', path: '/memory', icon: Archive },
  { label: 'Mind', path: '/mind', icon: Brain },
  { label: 'Journal', path: '/journal', icon: NotebookPen },
  { label: 'Projects', path: '/projects', icon: FolderKanban },
  { label: 'Profile', path: '/profile', icon: CircleUserRound },
];

// All settings sub-pages (mirrors the desktop SidebarSettings nav), surfaced on
// mobile as a collapsible group so every settings page is reachable. Before
// this, only /settings/agents (the redirect target) could be opened on mobile.
const SETTINGS_ROUTES = [
  { label: 'Agents', path: '/settings/agents' },
  { label: 'General', path: '/settings/general' },
  { label: 'Models', path: '/settings/models' },
  { label: 'Appearance', path: '/settings/appearance' },
  { label: 'Self-model', path: '/settings/skills' },
  { label: 'Routines', path: '/settings/routines' },
  { label: 'Voice & security', path: '/settings/voice' },
  { label: 'Local runtime', path: '/settings/local-runtime' },
  { label: 'Import & export', path: '/settings/portability' },
  { label: 'Account & preferences', path: '/settings/account' },
  { label: 'Cron health', path: '/settings/cron-health' },
  { label: 'Guide & help', path: '/settings/help' },
];

function isActiveRoute(pathname: string, path: string): boolean {
  if (path === '/chat') return pathname.startsWith('/chat');
  if (path === '/settings/agents') return pathname.startsWith('/settings') || pathname.startsWith('/profile/skills') || pathname.startsWith('/profile/schedule');
  return pathname === path || pathname.startsWith(`${path}/`);
}

function filteredThreads(threads: Thread[], query: string): Thread[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter((thread) => (thread.title || 'New conversation').toLowerCase().includes(q));
}

export default function MobileNavDrawer() {
  const open = useMobileShellStore((s) => s.drawerOpen);
  const close = useMobileShellStore((s) => s.closeDrawer);
  const drawerRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const threads = useThreadStore((s) => s.threads);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const loadThreads = useThreadStore((s) => s.loadThreads);
  const createThread = useThreadStore((s) => s.createThread);
  const openContextDrawer = useDrawerStore((s) => s.open);
  const closeContextDrawer = useDrawerStore((s) => s.close);
  const pendingCount = useNotificationStore(selectPendingInitiationsCount);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);
  const setActiveAgent = useAgentScopeStore((s) => s.setActiveAgent);
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentScopeOpen, setAgentScopeOpen] = useState(false);
  const settingsNavRef = useRef<HTMLDivElement | null>(null);
  const activeAgentName = useMemo(
    () => availableAgents.find((agent) => agent.id === activeAgentId)?.name ?? 'Luca',
    [activeAgentId, availableAgents],
  );

  // Auto-expand the Settings group when the drawer opens on a settings route,
  // so the current section is in view.
  useEffect(() => {
    if (open && location.pathname.startsWith('/settings')) setSettingsOpen(true);
  }, [open, location.pathname]);

  // The Settings group sits at the bottom of the nav list, so scroll it into
  // view when it expands — otherwise its items render below the fold.
  useEffect(() => {
    if (!settingsOpen) return;
    const t = setTimeout(
      () => settingsNavRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }),
      60,
    );
    return () => clearTimeout(t);
  }, [settingsOpen]);

  useEffect(() => {
    if (open) void loadThreads();
  }, [loadThreads, open]);

  useEffect(() => {
    close();
  }, [close, location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleEscape = useCallback(() => close(), [close]);
  useDialogFocus({
    active: open,
    containerRef: drawerRef,
    initialFocusRef: searchRef,
    onEscape: handleEscape,
  });

  const recentThreads = useMemo(
    () => filteredThreads(threads, query).slice(0, 32),
    [query, threads],
  );

  const go = (path: string) => {
    navigate(path);
    close();
  };

  const handleNewChat = async () => {
    if (!user) return;
    const id = await createThread(user.id);
    navigate(`/chat/${id}`);
    close();
  };

  const handleOpenActivity = () => {
    closeContextDrawer();
    openContextDrawer('notifications');
    close();
  };

  const handleSelectAgentScope = (id: string) => {
    if (!id) return;
    if (id !== activeAgentId) setActiveAgent(id);
    setAgentScopeOpen(false);
    close();
  };

  const handleSignOut = async () => {
    await signOut();
    close();
    navigate('/', { replace: true });
  };

  return (
    <>
      <div
        className="mobile-nav-backdrop"
        data-open={open ? 'true' : undefined}
        onClick={close}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="mobile-nav-drawer"
        data-open={open ? 'true' : undefined}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-hidden={!open}
        aria-label="Mobile navigation"
        tabIndex={-1}
      >
        <div className="mobile-nav-top">
          <div className="mobile-nav-brand">
            <Sparkles size={18} strokeWidth={1.7} />
            <span>Polyphonic</span>
          </div>
          <button type="button" className="mobile-nav-icon-btn" onClick={close} aria-label="Close navigation menu">
            <X size={21} strokeWidth={1.7} />
          </button>
        </div>

        <label className="mobile-nav-search">
          <Search size={18} strokeWidth={1.8} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
          />
        </label>

        <div className="mobile-nav-scroll">
          <section className="mobile-agent-scope" aria-label="Agent scope">
            <button
              type="button"
              className="mobile-agent-scope-trigger"
              onClick={() => setAgentScopeOpen((value) => !value)}
              aria-expanded={agentScopeOpen}
            >
              <span className="mobile-agent-scope-dot" aria-hidden="true" />
              <span className="mobile-agent-scope-copy">
                <span className="mobile-agent-scope-kicker">Active agent</span>
                <span className="mobile-agent-scope-name">{activeAgentName}</span>
                <span className="mobile-agent-scope-sub">Journal · Memory · Mind</span>
              </span>
              <ChevronRight
                className="mobile-agent-scope-chevron"
                size={16}
                strokeWidth={1.7}
                style={{
                  transform: agentScopeOpen ? 'rotate(90deg)' : 'none',
                }}
              />
            </button>

            {agentScopeOpen && (
              <div className="mobile-agent-scope-list" role="listbox" aria-label="Choose active agent">
                {availableAgents.map((agent) => {
                  const active = agent.id === activeAgentId;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      className="mobile-agent-scope-option"
                      data-active={active ? 'true' : undefined}
                      onClick={() => handleSelectAgentScope(agent.id)}
                      role="option"
                      aria-selected={active}
                    >
                      <span className="mobile-agent-scope-option-dot" aria-hidden="true" />
                      <span>{agent.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="mobile-nav-actions">
            <button type="button" className="mobile-nav-primary" onClick={handleNewChat}>
              <Plus size={19} strokeWidth={1.8} />
              <span>New chat</span>
            </button>
            <button type="button" className="mobile-nav-row" onClick={handleOpenActivity}>
              <Activity size={18} strokeWidth={1.8} />
              <span>Activity</span>
              {pendingCount > 0 && <span className="mobile-nav-count">{pendingCount}</span>}
            </button>
          </div>

          <nav className="mobile-nav-section" aria-label="Navigate">
            {PRIMARY_ROUTES.map(({ label, path, icon: Icon }) => (
              <button
                key={path}
                type="button"
                className="mobile-nav-row"
                data-active={isActiveRoute(location.pathname, path) ? 'true' : undefined}
                onClick={() => go(path)}
                aria-current={isActiveRoute(location.pathname, path) ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span>{label}</span>
                <ChevronRight className="mobile-nav-chevron" size={16} strokeWidth={1.7} />
              </button>
            ))}

            <div ref={settingsNavRef}>
              <button
                type="button"
                className="mobile-nav-row"
                data-active={location.pathname.startsWith('/settings') ? 'true' : undefined}
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
              >
                <Settings size={18} strokeWidth={1.75} />
                <span>Settings</span>
                <ChevronRight
                  className="mobile-nav-chevron"
                  size={16}
                  strokeWidth={1.7}
                  style={{
                    transform: settingsOpen ? 'rotate(90deg)' : 'none',
                    transition: 'transform 160ms var(--ease-out)',
                  }}
                />
              </button>
              {settingsOpen &&
                SETTINGS_ROUTES.map(({ label, path }) => {
                  const active =
                    location.pathname === path || location.pathname.startsWith(`${path}/`);
                  return (
                    <button
                      key={path}
                      type="button"
                      className="mobile-nav-row"
                      style={{ paddingLeft: 46 }}
                      data-active={active ? 'true' : undefined}
                      onClick={() => go(path)}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span>{label}</span>
                    </button>
                  );
                })}
            </div>
          </nav>

          <div className="mobile-nav-section mobile-nav-threads">
            <div className="mobile-nav-section-label">Recent threads</div>
            {recentThreads.length === 0 && (
              <div className="mobile-nav-empty">No matching threads.</div>
            )}
            {recentThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="mobile-thread-row"
                data-active={thread.id === currentThreadId ? 'true' : undefined}
                onClick={() => go(`/chat/${thread.id}`)}
              >
                <span className="mobile-thread-dot" aria-hidden="true" />
                <span className="mobile-thread-title">{thread.title || 'New conversation'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mobile-nav-footer">
          <div className="mobile-nav-account">
            <Bot size={18} strokeWidth={1.7} />
            <div>
              <div className="mobile-nav-account-name">{user?.email || 'Account'}</div>
              <div className="mobile-nav-account-sub">signed in</div>
            </div>
          </div>
          <button type="button" className="mobile-nav-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
