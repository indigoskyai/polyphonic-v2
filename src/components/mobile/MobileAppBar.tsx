import { Activity, Info, Menu } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AgentPicker } from '@/components/composer/AgentPicker';
import { getMobileSurfaceMeta } from '@/lib/mobileShell';
import { useAuthStore } from '@/stores/authStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMobileShellStore } from '@/stores/mobileShellStore';
import { useNotificationStore, selectPendingInitiationsCount } from '@/stores/notificationStore';
import { useThreadStore } from '@/stores/threadStore';
import { useInterfaceModeStore } from '@/stores/interfaceModeStore';
import { shouldShowStudioNavigation } from '@/lib/interfaceMode';

function threadIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/chat/')) return null;
  const id = pathname.split('/')[2];
  return id || null;
}

function isAgentScopedSurface(pathname: string): boolean {
  return (
    pathname.startsWith('/chat') ||
    pathname.startsWith('/journal') ||
    pathname.startsWith('/memory') ||
    pathname.startsWith('/mind') ||
    pathname.startsWith('/profile/identity') ||
    pathname.startsWith('/profile/skills') ||
    pathname.startsWith('/profile/schedule')
  );
}

export default function MobileAppBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const routeThreadId = threadIdFromPath(location.pathname);
  const threads = useThreadStore((s) => s.threads);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const messages = useThreadStore((s) => s.messages);
  const loadThreads = useThreadStore((s) => s.loadThreads);
  const createThread = useThreadStore((s) => s.createThread);
  const updateThreadAgent = useThreadStore((s) => s.updateThreadAgent);
  const openMobileNav = useMobileShellStore((s) => s.openDrawer);
  const openContextDrawer = useDrawerStore((s) => s.open);
  const closeContextDrawer = useDrawerStore((s) => s.close);
  const pendingCount = useNotificationStore(selectPendingInitiationsCount);
  const interfaceMode = useInterfaceModeStore((s) => s.mode);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const setActiveAgent = useAgentScopeStore((s) => s.setActiveAgent);
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);
  // On the chat surface, mirror the hero's source of truth (the persisted
  // landing agent) instead of the cross-surface agent scope, so the top bar
  // never says "Luca" while the hero shows the adopted landing agent.
  const landingAgentId = useSettingsStore((s) => s.landing_agent_id) || 'luca';
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  useEffect(() => {
    if (threads.length === 0) void loadThreads();
  }, [loadThreads, threads.length]);

  const threadTitle = useMemo(
    () => threads.find((t) => t.id === routeThreadId)?.title ?? null,
    [routeThreadId, threads],
  );
  const currentThread = useMemo(
    () => threads.find((t) => t.id === (currentThreadId || routeThreadId)),
    [currentThreadId, routeThreadId, threads],
  );

  const baseMeta = getMobileSurfaceMeta(location.pathname, threadTitle);
  const studioNavigation = shouldShowStudioNavigation(interfaceMode);
  const meta = !studioNavigation && location.pathname.startsWith('/journal')
    ? { ...baseMeta, title: 'Notebook', subtitle: 'Inner life and creations' }
    : !studioNavigation && location.pathname.startsWith('/projects')
      ? { ...baseMeta, title: 'Create', subtitle: 'Artifacts and work' }
      : baseMeta;
  const isChatSurface = location.pathname.startsWith('/chat');
  const runtimeAgentId = isChatSurface ? (currentThread?.agent_id || landingAgentId) : activeAgentId;
  const activeAgentName = availableAgents.find((agent) => agent.id === runtimeAgentId)?.name || 'Luca';
  const title = isChatSurface ? activeAgentName : meta.title;
  const subtitle = isChatSurface ? (threadTitle || 'new chat') : meta.subtitle;
  const showAgentPicker = !!user && isAgentScopedSurface(location.pathname);

  const handleAgentChange = useCallback(async (id: string) => {
    if (!id || id === runtimeAgentId) return;
    setActiveAgent(id);

    if (!user || !isChatSurface) return;

    if (!currentThreadId) {
      // Bare /chat landing: switch the hero's agent IN PLACE by persisting the
      // landing choice — ChatView's empty-landing field follows landing_agent_id
      // and morphs to the new agent. Do NOT spawn a blank thread + navigate:
      // that sets a route threadId, which flips the empty-state off and leaves a
      // black screen with only the composer (no particle field).
      void updateSetting('landing_agent_id', id === 'luca' ? null : id);
      return;
    }

    if (messages.length === 0) {
      await updateThreadAgent(currentThreadId, id);
      return;
    }

    const nextThreadId = await createThread(user.id, id);
    navigate(`/chat/${nextThreadId}`);
  }, [
    createThread,
    currentThreadId,
    isChatSurface,
    messages.length,
    navigate,
    runtimeAgentId,
    setActiveAgent,
    updateSetting,
    updateThreadAgent,
    user,
  ]);

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
    <header className="mobile-app-bar" data-surface={isChatSurface ? 'chat' : undefined}>
      <button
        type="button"
        className="mobile-bar-button"
        onClick={openMenu}
        aria-label="Open navigation menu"
      >
        <Menu size={22} strokeWidth={1.8} />
      </button>

      <div className="mobile-bar-title" aria-live="polite">
        {showAgentPicker ? (
          <div className="mobile-bar-agent-stack">
            <div className="mobile-bar-agent-picker">
              <AgentPicker
                activeAgentId={runtimeAgentId}
                onChange={(id) => { void handleAgentChange(id); }}
                variant="header"
              />
            </div>
            {!isChatSurface && (
              <div className="mobile-bar-agent-surface">{meta.title}</div>
            )}
          </div>
        ) : (
          <div className="mobile-bar-title-main">{title}</div>
        )}
        <div className="mobile-bar-title-sub">{subtitle}</div>
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
