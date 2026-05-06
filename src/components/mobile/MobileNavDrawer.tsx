import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  FolderKanban,
  Import,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useAuthStore } from '@/stores/authStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useMobileShellStore } from '@/stores/mobileShellStore';
import { useNotificationStore, selectPendingInitiationsCount } from '@/stores/notificationStore';
import { useThreadStore, type Thread } from '@/stores/threadStore';

const MAIN_ROUTES = [
  { label: 'Chat', path: '/chat', icon: MessageCircle },
  { label: 'Memory', path: '/memory', icon: Archive },
  { label: 'Mind', path: '/mind', icon: Brain },
  { label: 'Profile', path: '/profile', icon: CircleUserRound },
  { label: 'Import', path: '/import', icon: Import },
  { label: 'Projects', path: '/projects', icon: FolderKanban },
  { label: 'Workspace', path: '/workspace', icon: FolderKanban },
  { label: 'Group', path: '/group', icon: UsersRound },
  { label: 'Checkpoints', path: '/checkpoints', icon: CheckCircle2 },
  { label: 'Settings', path: '/settings/agents', icon: Settings },
];

const QUICK_ROUTES = MAIN_ROUTES.filter((route) =>
  ['/memory', '/mind', '/projects', '/profile', '/import'].includes(route.path),
);

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
  const [query, setQuery] = useState('');

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

  const handleSignOut = async () => {
    await signOut();
    close();
    navigate('/auth/login', { replace: true });
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

          <div className="mobile-nav-quick" aria-label="Core surfaces">
            {QUICK_ROUTES.map(({ label, path, icon: Icon }) => (
              <button
                key={path}
                type="button"
                className="mobile-nav-quick-btn"
                data-active={isActiveRoute(location.pathname, path) ? 'true' : undefined}
                onClick={() => go(path)}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            ))}
          </div>

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

          <nav className="mobile-nav-section" aria-label="App navigation">
            <div className="mobile-nav-section-label">App</div>
            {MAIN_ROUTES.map(({ label, path, icon: Icon }) => (
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
          </nav>
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
