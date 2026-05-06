import { Activity, Info, Menu } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getMobileSurfaceMeta } from '@/lib/mobileShell';
import { useDrawerStore } from '@/stores/drawerStore';
import { useMobileShellStore } from '@/stores/mobileShellStore';
import { useNotificationStore, selectPendingInitiationsCount } from '@/stores/notificationStore';
import { useThreadStore } from '@/stores/threadStore';

function threadIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/chat/')) return null;
  const id = pathname.split('/')[2];
  return id || null;
}

export default function MobileAppBar() {
  const location = useLocation();
  const routeThreadId = threadIdFromPath(location.pathname);
  const threads = useThreadStore((s) => s.threads);
  const loadThreads = useThreadStore((s) => s.loadThreads);
  const openMobileNav = useMobileShellStore((s) => s.openDrawer);
  const openContextDrawer = useDrawerStore((s) => s.open);
  const closeContextDrawer = useDrawerStore((s) => s.close);
  const pendingCount = useNotificationStore(selectPendingInitiationsCount);

  useEffect(() => {
    if (threads.length === 0) void loadThreads();
  }, [loadThreads, threads.length]);

  const threadTitle = useMemo(
    () => threads.find((t) => t.id === routeThreadId)?.title ?? null,
    [routeThreadId, threads],
  );

  const meta = getMobileSurfaceMeta(location.pathname, threadTitle);

  const openMenu = () => {
    closeContextDrawer();
    openMobileNav();
  };

  const openContext = () => {
    if (meta.contextAction === 'thread-detail' && routeThreadId) {
      openContextDrawer('thread-detail', { threadId: routeThreadId });
      return;
    }
    openContextDrawer('notifications');
  };

  return (
    <header className="mobile-app-bar">
      <button
        type="button"
        className="mobile-bar-button"
        onClick={openMenu}
        aria-label="Open navigation menu"
      >
        <Menu size={22} strokeWidth={1.8} />
      </button>

      <div className="mobile-bar-title" aria-live="polite">
        <div className="mobile-bar-title-main">{meta.title}</div>
        <div className="mobile-bar-title-sub">{meta.subtitle}</div>
      </div>

      <button
        type="button"
        className="mobile-bar-button"
        data-pending={pendingCount > 0 && meta.contextAction !== 'thread-detail' ? 'true' : undefined}
        onClick={openContext}
        aria-label={meta.contextAction === 'thread-detail' ? 'Open thread details' : `Open activity${pendingCount > 0 ? `, ${pendingCount} pending` : ''}`}
      >
        {meta.contextAction === 'thread-detail' ? <Info size={21} strokeWidth={1.7} /> : <Activity size={21} strokeWidth={1.7} />}
        {pendingCount > 0 && meta.contextAction !== 'thread-detail' && <span className="mobile-bar-dot" aria-hidden="true" />}
      </button>
    </header>
  );
}
