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
import {
  getRailSurfaces,
  resolveActiveRailSurfaceId,
  shouldShowStudioNavigation,
  type RailSurfaceIcon,
} from '@/lib/interfaceMode';
import { prefetchRoute } from '@/lib/routePrefetch';

// Per-route section content — the same components the old standalone Sidebar
// card resolved. They now render *inside* the rail surface when it's
// expanded, so the rail "reveals further to become the panel" instead of a
// separate card sliding in beside it.
import SidebarChat from './sidebar/SidebarChat';
import SidebarMemory from './sidebar/SidebarMemory';
import SidebarMind from './sidebar/SidebarMind';
import SidebarProfile from './sidebar/SidebarProfile';
import SidebarImport from './sidebar/SidebarImport';
import SidebarProjects from './sidebar/SidebarProjects';
import SidebarSettings from './sidebar/SidebarSettings';
import SidebarJournal from './sidebar/SidebarJournal';

const ICON_FOR_SURFACE: Record<RailSurfaceIcon, React.ReactNode> = {
  chat:     <MessageSquare size={16} strokeWidth={1.6} />,
  notebook: <NotebookPen   size={16} strokeWidth={1.6} />,
  memory:   <Brain         size={16} strokeWidth={1.6} />,
  agents:   <Bot           size={16} strokeWidth={1.6} />,
  mind:     <Brain         size={16} strokeWidth={1.6} />,
  projects: <Layers        size={16} strokeWidth={1.6} />,
  profile:  <User          size={16} strokeWidth={1.6} />,
};

const RAIL_COLLAPSED = 52;

function resolveSectionContent(path: string): React.ComponentType {
  if (path.startsWith('/memory')) return SidebarMemory;
  if (path.startsWith('/mind')) return SidebarMind;
  if (path.startsWith('/journal')) return SidebarJournal;
  if (path.startsWith('/notebook')) return SidebarJournal;
  if (path.startsWith('/profile/identity')) return SidebarMind;
  if (path.startsWith('/profile/revisions')) return SidebarMind;
  if (path.startsWith('/profile/skills')) return SidebarSettings;
  if (path.startsWith('/profile/schedule')) return SidebarSettings;
  if (path.startsWith('/profile')) return SidebarProfile;
  if (path === '/settings/public-profile') return SidebarProfile;
  if (path.startsWith('/import')) return SidebarImport;
  if (path.startsWith('/projects')) return SidebarProjects;
  if (path.startsWith('/settings')) return SidebarSettings;
  return SidebarChat;
}

/**
 * Rail — the single left navigation surface.
 *
 * One surface that *widens* rather than a thin icon rail plus a separate
 * floating panel card. Collapsed it's an icon column on the floor; expanded
 * the same surface grows to reveal each button's label and the active
 * section's content below the primary nav. The main card is the only
 * elevated card and simply reflows right as this surface widens — so it
 * reads as "the main card slid over to uncover more of the rail," not as a
 * second card appearing.
 *
 * Toggle: brand mark, the panel-toggle button, or ⌘\ flip expanded state
 * via sidebarStore.
 */
export default function Rail() {
  const _user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const expanded = useSidebarStore((s) => s.visible);
  const expandedWidth = useSidebarStore((s) => s.width);
  const setExpanded = useSidebarStore((s) => s.setVisible);
  const toggle = useSidebarStore((s) => s.toggle);
  const openDrawer = useDrawerStore((s) => s.open);
  const activeDrawer = useDrawerStore((s) => s.active);
  const pendingCount = useNotificationStore(selectPendingInitiationsCount);
  const interfaceMode = useInterfaceModeStore((s) => s.mode);
  const studioMode = shouldShowStudioNavigation(interfaceMode);
  const surfaces = getRailSurfaces(interfaceMode);
  const activeSurfaceId = resolveActiveRailSurfaceId(interfaceMode, location.pathname);

  const SectionContent = resolveSectionContent(location.pathname);

  // Navigate without forcing the panel open — collapsed users can still
  // jump between sections by clicking icons. Expansion is its own gesture
  // (brand mark / toggle / ⌘\), matching the classic chat-app rail.
  const goTo = (path: string) => navigate(path);

  // Toggle via ⌘\ (or Ctrl+\)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);

  const helpActive = location.pathname.startsWith('/settings/help');
  const settingsActive =
    (location.pathname.startsWith('/settings')
      && !helpActive
      && (studioMode || activeSurfaceId !== 'agents'))
    || location.pathname.startsWith('/profile/skills')
    || location.pathname.startsWith('/profile/schedule');

  return (
    <div
      className="rail-surface flex flex-col"
      data-expanded={expanded ? 'true' : undefined}
      style={{
        width: expanded ? expandedWidth : RAIL_COLLAPSED,
        minWidth: expanded ? expandedWidth : RAIL_COLLAPSED,
        background: 'transparent',
        position: 'relative',
        overflow: 'hidden',
        zIndex: 10,
        transition:
          'width var(--dur-slow, 500ms) var(--ease-premium, cubic-bezier(0.22,1,0.36,1)), min-width var(--dur-slow, 500ms) var(--ease-premium, cubic-bezier(0.22,1,0.36,1))',
      }}
    >
      {/* Header — brand mark + collapse affordance. */}
      <div
        className="flex items-center"
        style={{ height: 44, padding: expanded ? '0 10px 0 13px' : '0', justifyContent: expanded ? 'space-between' : 'center', flexShrink: 0 }}
      >
        <button
          type="button"
          onClick={toggle}
          title="Polyphonic"
          aria-label="Toggle panel"
          style={{
            appearance: 'none',
            width: 26,
            height: 26,
            border: '1px solid var(--border-faint)',
            borderRadius: 6,
            background: 'rgba(255, 255, 255, 0.018)',
            color: 'var(--text-soft)',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1,
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          P
        </button>
        {expanded && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse panel"
            className="rail-nav-icon"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-soft)',
            }}
          >
            <PanelLeft size={15} strokeWidth={1.6} />
          </button>
        )}
      </div>

      {/* Primary nav */}
      <div className="flex flex-col" style={{ gap: 2, padding: expanded ? '4px 8px' : '4px 0', flexShrink: 0 }}>
        {surfaces.map((surface) => (
          <RailNavRow
            key={surface.id}
            icon={ICON_FOR_SURFACE[surface.icon]}
            label={surface.label}
            guideId={surface.guideId}
            expanded={expanded}
            active={activeSurfaceId === surface.id}
            onClick={() => goTo(surface.path)}
            prime={() => prefetchRoute(surface.path)}
          />
        ))}
      </div>

      {/* Expanded: section content fills the remaining height. Collapsed: a
          flexible spacer pushes the utilities to the bottom. */}
      {expanded ? (
        <div className="rail-section flex-1 min-h-0 flex flex-col" style={{ marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: 1, background: 'var(--border-faint)', margin: '0 12px 4px' }} />
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <SectionContent />
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Bottom utilities */}
      <div className="flex flex-col" style={{ gap: 2, padding: expanded ? '4px 8px 8px' : '4px 0 8px', flexShrink: 0 }}>
        <RailNavRow
          icon={<Activity size={15} strokeWidth={1.6} />}
          label="Activity"
          guideId="rail-activity"
          expanded={expanded}
          active={activeDrawer === 'notifications'}
          badge={pendingCount > 0}
          onClick={() => openDrawer('notifications')}
        />
        <RailNavRow
          icon={<HelpCircle size={16} strokeWidth={1.6} />}
          label="Help"
          guideId="rail-help"
          expanded={expanded}
          active={helpActive}
          onClick={() => goTo('/settings/help')}
          prime={() => prefetchRoute('/settings/help')}
        />
        <RailNavRow
          icon={<Cog size={16} strokeWidth={1.6} />}
          label="Settings"
          guideId="rail-settings"
          expanded={expanded}
          active={settingsActive}
          onClick={() => goTo('/settings/agents')}
          prime={() => prefetchRoute('/settings/agents')}
        />
      </div>
    </div>
  );
}

interface RailNavRowProps {
  icon: React.ReactNode;
  label: string;
  guideId?: string;
  expanded: boolean;
  active: boolean;
  badge?: boolean;
  onClick: () => void;
  prime?: () => void;
}

function RailNavRow({ icon, label, guideId, expanded, active, badge, onClick, prime }: RailNavRowProps) {
  return (
    <button
      type="button"
      className="rail-nav-row"
      data-active={active ? 'true' : undefined}
      data-label={expanded ? undefined : label}
      data-guide-id={guideId}
      onClick={onClick}
      onPointerEnter={prime}
      onFocus={prime}
      onPointerDown={prime}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: expanded ? '100%' : 52,
        height: 34,
        // Icon stays at a constant x in both states so the label appears to
        // "reveal" beside a fixed icon rather than the icon sliding around.
        padding: expanded ? '0 12px' : '0',
        justifyContent: expanded ? 'flex-start' : 'center',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--overlay-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: active ? 500 : 450,
        letterSpacing: 'var(--track-ui)',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
      }}
    >
      <span style={{ flexShrink: 0, display: 'inline-flex', position: 'relative' }}>
        {icon}
        {badge && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--luca, #c9a87c)',
            }}
          />
        )}
      </span>
      {expanded && (
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      )}
    </button>
  );
}
