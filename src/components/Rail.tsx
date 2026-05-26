import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  Brain,
  Bot,
  NotebookPen,
  Layers,
  User,
  Activity,
  Cog,
  HelpCircle,
  PanelLeft,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useNotificationStore, selectPendingInitiationsCount } from '@/stores/notificationStore';
import { useInterfaceModeStore } from '@/stores/interfaceModeStore';
import { shouldShowStudioNavigation } from '@/lib/interfaceMode';
import { prefetchRoute } from '@/lib/routePrefetch';

/**
 * Rail — always-visible thin column on the floor.
 *
 * Holds the brand mark, panel toggle, primary nav icons, and bottom
 * utilities (Activity bell + Settings). Sits at --rail-width and uses
 * the floor color directly (no card surface) so it reads as a deliberate
 * piece of the depth, framing the elevated sidebar card to its right.
 *
 * Each icon shows a hover label (tooltip) via the [data-label] CSS hook
 * defined in index.css — solid background, 350ms hover delay so labels
 * don't pop while you're scrubbing through the rail. The wrapper carries
 * an explicit z-index so labels clear the sidebar reliably.
 *
 * Toggle behavior: clicking the brand mark or the panel-toggle button
 * (or pressing ⌘\) toggles the sidebar via sidebarStore. The sidebar
 * handles its own slide animation; the rail never moves.
 */
export default function Rail() {
  const _user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarVisible = useSidebarStore((s) => s.visible);
  const setSidebarVisible = useSidebarStore((s) => s.setVisible);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const openDrawer = useDrawerStore((s) => s.open);
  const activeDrawer = useDrawerStore((s) => s.active);
  const pendingCount = useNotificationStore(selectPendingInitiationsCount);
  const interfaceMode = useInterfaceModeStore((s) => s.mode);
  const studioMode = shouldShowStudioNavigation(interfaceMode);

  // Navigate to a section AND ensure the sidebar is open. Clicking a rail
  // icon when the sidebar is collapsed should both jump to that section and
  // reveal its content — never leave the user in a state where they tapped
  // the icon but nothing visible changed beyond the active highlight.
  const goTo = (path: string) => {
    setSidebarVisible(true);
    navigate(path);
  };

  // Toggle sidebar via ⌘\ (or Ctrl+\)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  const helpActive = location.pathname.startsWith('/settings/help');
  const agentsActive = location.pathname.startsWith('/settings/agents');
  const settingsActive =
    (location.pathname.startsWith('/settings') && !helpActive && (studioMode || !agentsActive)) ||
    location.pathname.startsWith('/profile/skills') ||
    location.pathname.startsWith('/profile/schedule');

  const activeView = location.pathname.startsWith('/chat') ? 'chat'
    : location.pathname.startsWith('/memory') ? 'memory'
    : location.pathname.startsWith('/mind') ? 'mind'
    : location.pathname.startsWith('/journal') ? 'journal'
    : location.pathname.startsWith('/projects') ? 'projects'
    : location.pathname.startsWith('/settings/agents') ? 'agents'
    : location.pathname.startsWith('/profile/identity') ? 'mind'
    : location.pathname.startsWith('/profile/revisions') ? 'mind'
    : location.pathname.startsWith('/profile') ? 'profile'
    : location.pathname.startsWith('/dashboard') ? 'mind'
    : 'chat';

  return (
    <div
      className="flex-shrink-0 flex flex-col items-center"
      style={{
        width: 'var(--rail-width)',
        minWidth: 'var(--rail-width)',
        padding: '12px 0',
        gap: 2,
        background: 'transparent',
        position: 'relative',
        // z-index above the sidebar so hover labels never get clipped.
        zIndex: 10,
      }}
    >
      {/* Brand mark — clickable to toggle sidebar (matches the original
          Rail's identity-as-toggle pattern). */}
      <button
        type="button"
        onClick={toggleSidebar}
        title="Polyphonic"
        aria-label="Toggle sidebar"
        style={{
          appearance: 'none',
          width: 26,
          height: 26,
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          background: 'rgba(255, 255, 255, 0.018)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          fontWeight: 300,
          cursor: 'pointer',
          flexShrink: 0,
          marginBottom: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition:
            'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        }}
      >
        P
      </button>

      {/* Toggle button — explicit panel-collapse affordance with rotating
          chevron. No hover tooltip (Riley's call: the icon is its own
          affordance and the keyboard shortcut is documented elsewhere). */}
      <button
        type="button"
        className="rail-nav-icon w-7 h-7 rounded flex items-center justify-center cursor-pointer shrink-0"
        onClick={toggleSidebar}
        aria-label={sidebarVisible ? 'Collapse panel' : 'Expand panel'}
        style={{ color: 'var(--text-soft)' }}
      >
        <PanelLeft
          size={14}
          strokeWidth={1.6}
          style={{
            transform: sidebarVisible ? 'none' : 'rotate(180deg)',
            transition: 'transform var(--dur-normal) var(--ease-premium)',
          }}
        />
      </button>

      {/* Primary nav — Companion/Guided modes tell the simpler story first;
          Studio keeps the full diagnostic map. */}
      <NavIcon
        icon={<MessageSquare size={15} strokeWidth={1.55} />}
        label="Chat"
        path="/chat"
        guideId="rail-chat"
        active={activeView === 'chat'}
        onClick={() => goTo('/chat')}
      />
      {studioMode && (
        <NavIcon
          icon={<Brain size={15} strokeWidth={1.55} />}
          label="Memory"
          path="/memory"
          guideId="rail-memory"
          active={activeView === 'memory'}
          onClick={() => goTo('/memory')}
        />
      )}
      <NavIcon
        icon={studioMode ? <Bot size={15} strokeWidth={1.55} /> : <NotebookPen size={15} strokeWidth={1.55} />}
        label={studioMode ? 'Mind' : 'Notebook'}
        path={studioMode ? '/mind' : '/journal'}
        guideId={studioMode ? 'rail-mind' : 'rail-journal'}
        active={studioMode ? activeView === 'mind' : activeView === 'journal'}
        onClick={() => goTo(studioMode ? '/mind' : '/journal')}
      />
      {studioMode && (
        <NavIcon
          icon={<NotebookPen size={15} strokeWidth={1.55} />}
          label="Journal"
          path="/journal"
          guideId="rail-journal"
          active={activeView === 'journal'}
          onClick={() => goTo('/journal')}
        />
      )}
      <NavIcon
        icon={<Layers size={15} strokeWidth={1.55} />}
        label={studioMode ? 'Projects' : 'Create'}
        path="/projects"
        guideId="rail-projects"
        active={activeView === 'projects'}
        onClick={() => goTo('/projects')}
      />
      {!studioMode && (
        <>
          <NavIcon
            icon={<Brain size={15} strokeWidth={1.55} />}
            label="Mind"
            path="/mind"
            guideId="rail-mind"
            active={activeView === 'mind'}
            onClick={() => goTo('/mind')}
          />
          <NavIcon
            icon={<Bot size={15} strokeWidth={1.55} />}
            label="Agents"
            path="/settings/agents"
            guideId="rail-agents"
            active={activeView === 'agents'}
            onClick={() => goTo('/settings/agents')}
          />
        </>
      )}
      {studioMode && (
        <NavIcon
          icon={<User size={15} strokeWidth={1.55} />}
          label="Profile"
          path="/profile"
          guideId="rail-profile"
          active={activeView === 'profile'}
          onClick={() => goTo('/profile')}
        />
      )}

      {/* Spacer — clicking the empty area between nav and utilities toggles
          the sidebar, so the user can collapse/expand by clicking anywhere
          in the rail's open space (not just on the toggle button). */}
      <button
        type="button"
        className="flex-1 w-full"
        onClick={toggleSidebar}
        aria-label="Toggle panel"
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          margin: 0,
        }}
      />

      {/* Activity bell — opens notifications drawer. The pendingCount dot
          breathes the same sage rhythm as the brand identity. */}
      <button
        type="button"
        className="rail-bell shrink-0"
        data-active={activeDrawer === 'notifications' ? 'true' : undefined}
        data-label="Activity"
        data-guide-id="rail-activity"
        onClick={() => openDrawer('notifications')}
        aria-label={`Activity${pendingCount > 0 ? ` — ${pendingCount} pending` : ''}`}
      >
        <Activity size={14} strokeWidth={1.55} />
        {pendingCount > 0 && <span className="rail-bell__dot" aria-hidden="true" />}
      </button>

      <NavIcon
        icon={<HelpCircle size={15} strokeWidth={1.55} />}
        label="Help"
        path="/settings/help"
        guideId="rail-help"
        active={helpActive}
        onClick={() => goTo('/settings/help')}
      />

      {/* Settings — auto-opens the sidebar like the other nav icons */}
      <NavIcon
        icon={<Cog size={15} strokeWidth={1.55} />}
        label="Settings"
        path="/settings/agents"
        guideId="rail-settings"
        active={settingsActive}
        onClick={() => goTo('/settings/agents')}
      />
    </div>
  );
}

interface NavIconProps {
  icon: React.ReactNode;
  label: string;
  path: string;
  guideId?: string;
  active: boolean;
  onClick: () => void;
}

function NavIcon({ icon, label, path, guideId, active, onClick }: NavIconProps) {
  const prime = () => prefetchRoute(path);

  return (
    <button
      type="button"
      className="rail-nav-icon w-7 h-7 rounded flex items-center justify-center cursor-pointer shrink-0"
      data-active={active ? 'true' : undefined}
      data-label={label}
      data-guide-id={guideId}
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        background: active ? 'var(--overlay-active)' : undefined,
      }}
      onClick={onClick}
      onPointerEnter={prime}
      onFocus={prime}
      onPointerDown={prime}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
    </button>
  );
}
