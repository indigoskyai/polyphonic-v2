import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Activity,
  ArrowDownToLine,
  Bot,
  Brain,
  Cog,
  Feather,
  Layers,
  MessageSquare,
  Plus,
  User,
} from 'lucide-react';
import { useThreadStore } from '@/stores/threadStore';
import { useAuthStore } from '@/stores/authStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useNotificationStore, selectPendingInitiationsCount } from '@/stores/notificationStore';
import { prefetchRoute } from '@/lib/routePrefetch';
import { supabase } from '@/integrations/supabase/client';
import SidebarChat from './sidebar/SidebarChat';
import SidebarMemory from './sidebar/SidebarMemory';
import SidebarMind from './sidebar/SidebarMind';
import SidebarProfile from './sidebar/SidebarProfile';
import SidebarImport from './sidebar/SidebarImport';
import SidebarProjects from './sidebar/SidebarProjects';
import SidebarSettings from './sidebar/SidebarSettings';
import SidebarJournal from './sidebar/SidebarJournal';

// ─────────────────────────────────────────────────────────────────────────────
// Width tokens — collapsed matches the original rail exactly so the column
// reads as floor-chrome in both states.
// ─────────────────────────────────────────────────────────────────────────────
const COLLAPSED_WIDTH = 36;
const EXPANDED_WIDTH = 256;

interface EmotionalIndicator {
  breatheSpeed: number;
  tint: string;
  label: string;
}

function computeEmotionalIndicator(state: Record<string, number> | null): EmotionalIndicator {
  if (!state) return { breatheSpeed: 4, tint: 'var(--text-secondary)', label: 'present' };

  const { curiosity = 0.5, warmth = 0.5, restlessness = 0.5, clarity = 0.5, creative_flow = 0.5, isolation = 0.5 } = state;

  const activation = (curiosity + restlessness + creative_flow) / 3;
  const breatheSpeed = 6 - activation * 4;

  const dims = [
    { name: 'curious', value: curiosity, tint: '#c9a87c' },
    { name: 'warm', value: warmth, tint: '#c9a87c' },
    { name: 'restless', value: restlessness, tint: '#a88cc9' },
    { name: 'clear', value: clarity, tint: '#5b8aad' },
    { name: 'creative', value: creative_flow, tint: '#8ca89c' },
    { name: 'withdrawn', value: isolation, tint: '#7a6f6f' },
  ].sort((a, b) => b.value - a.value);

  return {
    breatheSpeed: Math.max(1.5, breatheSpeed),
    tint: dims[0].value > 0.5 ? dims[0].tint : 'var(--text-secondary)',
    label: dims[0].value > 0.5 ? dims[0].name : 'present',
  };
}

export default function NavColumn() {
  const [emotionalIndicator, setEmotionalIndicator] = useState<EmotionalIndicator>({ breatheSpeed: 4, tint: 'var(--text-secondary)', label: 'present' });
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { createThread } = useThreadStore();
  const expanded = useSidebarStore((s) => s.visible);
  const toggle = useSidebarStore((s) => s.toggle);
  const openDrawer = useDrawerStore((s) => s.open);
  const activeDrawer = useDrawerStore((s) => s.active);
  const pendingCount = useNotificationStore(selectPendingInitiationsCount);

  const path = location.pathname;
  const settingsOpen = path.startsWith('/settings')
    || path.startsWith('/profile/skills')
    || path.startsWith('/profile/schedule');

  useEffect(() => {
    if (!user) return;
    supabase.from('emotional_state').select('curiosity, restlessness, warmth, clarity, creative_flow, isolation')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setEmotionalIndicator(computeEmotionalIndicator(data as Record<string, number>));
      });
  }, [user]);

  const activeView = path.startsWith('/chat') ? 'chat'
    : path.startsWith('/memory') ? 'memory'
    : path.startsWith('/mind') ? 'mind'
    : path.startsWith('/journal') ? 'journal'
    : path.startsWith('/import') ? 'import'
    : path.startsWith('/projects') ? 'projects'
    : path.startsWith('/profile/identity') ? 'mind'
    : path.startsWith('/profile/revisions') ? 'mind'
    : path.startsWith('/profile/skills') ? 'settings'
    : path.startsWith('/profile/schedule') ? 'settings'
    : path.startsWith('/profile') ? 'profile'
    : path.startsWith('/dashboard') ? 'mind'
    : 'chat';

  // View-specific content mounted in the contextual section below the nav.
  const ViewContent =
    path.startsWith('/memory') ? SidebarMemory
    : path.startsWith('/mind') ? SidebarMind
    : path.startsWith('/journal') ? SidebarJournal
    : path.startsWith('/profile/identity') ? SidebarMind
    : path.startsWith('/profile/revisions') ? SidebarMind
    : path.startsWith('/profile/skills') ? SidebarSettings
    : path.startsWith('/profile/schedule') ? SidebarSettings
    : path.startsWith('/profile') ? SidebarProfile
    : path === '/settings/public-profile' ? SidebarProfile
    : path.startsWith('/import') ? SidebarImport
    : path.startsWith('/projects') ? SidebarProjects
    : path.startsWith('/settings') ? SidebarSettings
    : SidebarChat;

  const handleNewThread = async () => {
    if (!user) return;
    const id = await createThread(user.id);
    navigate(`/chat/${id}`);
  };

  // Horizontal padding that matches across all sections of the column.
  const sectionPadX = expanded ? 8 : 0;

  return (
    <div
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        minWidth: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        background: 'transparent',
        transition: 'width 520ms var(--ease-premium), min-width 520ms var(--ease-premium)',
      }}
    >
      {/* ── TOP — identity ───────────────────────────────────────────── */}
      <div
        style={{
          padding: expanded ? '14px 16px 10px' : '12px 0 8px',
          display: 'flex',
          justifyContent: expanded ? 'flex-start' : 'center',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={toggle}
          className="rounded-full flex items-center justify-center cursor-pointer relative"
          style={{
            width: 28,
            height: 28,
            background: 'var(--overlay-hover)',
            border: `1px solid ${emotionalIndicator.tint}30`,
            color: emotionalIndicator.tint,
            fontFamily: 'var(--font-sans)',
            fontStyle: 'italic',
            fontSize: 15,
            lineHeight: 1,
            paddingTop: 1,
            transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            animation: `breathe ${emotionalIndicator.breatheSpeed}s ease-in-out infinite`,
            flex: '0 0 auto',
          }}
          title={emotionalIndicator.label}
        >
          P
        </button>
        {expanded && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11.5,
              fontWeight: 200,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--text-soft)',
              opacity: 0.85,
              userSelect: 'none',
            }}
          >
            POLYPHONIC
          </span>
        )}
      </div>

      {/* ── PRIMARY ACTION — new thread ──────────────────────────────── */}
      <div style={{ padding: expanded ? `4px ${sectionPadX}px` : '4px 0' }}>
        <NavRow
          expanded={expanded}
          icon="new"
          label="New thread"
          path="/chat"
          active={false}
          onClick={handleNewThread}
        />
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────────── */}
      <Divider expanded={expanded} />

      {/* ── NAVIGATION ───────────────────────────────────────────────── */}
      <div style={{ padding: expanded ? `4px ${sectionPadX}px 6px` : '4px 0 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <NavRow expanded={expanded} icon="chat" label="Chat" path="/chat" active={activeView === 'chat'} onClick={() => navigate('/chat')} />
        <NavRow expanded={expanded} icon="memory" label="Memory" path="/memory" active={activeView === 'memory'} onClick={() => navigate('/memory')} />
        <NavRow expanded={expanded} icon="mind" label="Mind" path="/mind" active={activeView === 'mind'} onClick={() => navigate('/mind')} />
        <NavRow expanded={expanded} icon="journal" label="Journal" path="/journal" active={activeView === 'journal'} onClick={() => navigate('/journal')} />
        <NavRow expanded={expanded} icon="import" label="Import" path="/import" active={activeView === 'import'} onClick={() => navigate('/import')} />
        <NavRow expanded={expanded} icon="projects" label="Projects" path="/projects" active={activeView === 'projects'} onClick={() => navigate('/projects')} />
        <NavRow expanded={expanded} icon="profile" label="Profile" path="/profile" active={activeView === 'profile'} onClick={() => navigate('/profile')} />
        {/* Activity moved to the bottom section as a system-tray item — it's
            a notification surface, sits more naturally next to Settings. */}
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────────── */}
      <Divider expanded={expanded} />

      {/* ── CONTEXTUAL CONTENT ──────────────────────────────────────────
           Expanded: view-specific list (threads, memory items, etc.).
           Collapsed: a flexible spacer that doubles as a click-to-expand
           target so the rail still feels alive when narrow.            */}
      {expanded ? (
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{ paddingTop: 4 }}
        >
          <ViewContent />
        </div>
      ) : (
        <div
          className="flex-1 cursor-pointer"
          onClick={toggle}
          aria-label="Expand sidebar"
        />
      )}

      {/* ── BOTTOM — system tray (Activity + Settings) ─────────────── */}
      <Divider expanded={expanded} />
      <div style={{ padding: expanded ? `4px ${sectionPadX}px 12px` : '4px 0 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <NavRow
          expanded={expanded}
          icon="bell"
          label="Activity"
          path="/notifications"
          active={activeDrawer === 'notifications'}
          onClick={() => openDrawer('notifications')}
          badge={pendingCount > 0}
        />
        <NavRow
          expanded={expanded}
          icon="settings"
          label="Settings"
          path="/settings/agents"
          active={settingsOpen}
          onClick={() => navigate('/settings/agents')}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider — fading hairline that mirrors the auth shell's ribbon pattern.
// Transparent at both ends, faint in the middle. Only rendered in expanded
// state to keep the collapsed rail clean (whitespace + section position
// carry the rhythm there).
// ─────────────────────────────────────────────────────────────────────────────
function Divider({ expanded }: { expanded: boolean }) {
  if (!expanded) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        flex: '0 0 auto',
        height: 1,
        background:
          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.075) 28%, rgba(255,255,255,0.075) 72%, transparent 100%)',
        margin: '6px 0',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavRow — works in both collapsed (icon-only) and expanded (icon + label).
// ─────────────────────────────────────────────────────────────────────────────
interface NavRowProps {
  expanded: boolean;
  icon: string;
  label: string;
  path: string;
  active: boolean;
  onClick: () => void;
  badge?: boolean;
}

function NavRow({ expanded, icon, label, path, active, onClick, badge }: NavRowProps) {
  const prime = () => prefetchRoute(path);

  if (!expanded) {
    // Collapsed → match the original rail-nav-icon button exactly.
    return (
      <button
        type="button"
        className="rail-nav-icon w-6 h-6 rounded flex items-center justify-center cursor-pointer shrink-0 mx-auto"
        data-active={active ? 'true' : undefined}
        style={{
          color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
          background: active ? 'var(--overlay-active)' : undefined,
          position: 'relative',
        }}
        onClick={onClick}
        onPointerEnter={prime}
        onFocus={prime}
        onPointerDown={prime}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
      >
        <NavIconSvg icon={icon} />
        {badge && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 1,
              right: 1,
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--luca-full, #c9a87c)',
              boxShadow: '0 0 0 1.5px var(--floor, #08080a)',
              animation: 'breathe 6s ease-in-out infinite',
            }}
          />
        )}
      </button>
    );
  }

  // Expanded → list-style row with icon + label. Pill-shaped, bg-only highlight.
  return (
    <button
      type="button"
      className="rail-nav-icon shrink-0"
      data-active={active ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        height: 32,
        padding: '0 12px',
        borderRadius: 8,
        background: active ? 'var(--sage-overlay-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        position: 'relative',
        textAlign: 'left',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
      }}
      onClick={onClick}
      onPointerEnter={prime}
      onFocus={prime}
      onPointerDown={prime}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          flex: '0 0 22px',
          position: 'relative',
          color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        }}
      >
        <NavIconSvg icon={icon} />
        {badge && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -1,
              right: -1,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--luca-full, #c9a87c)',
              boxShadow: '0 0 0 2px var(--floor, #08080a)',
              animation: 'breathe 6s ease-in-out infinite',
            }}
          />
        )}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          fontWeight: active ? 600 : 500,
          letterSpacing: '-0.012em',
          color: 'inherit',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
          minWidth: 0,
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavIconSvg — strokes match the original rail icons.
// ─────────────────────────────────────────────────────────────────────────────
// Unified lucide-react icon set. All sized to 14px with stroke-width 1.5
// for visual consistency. Color comes from currentColor (parent CSS).
function NavIconSvg({ icon }: { icon: string }) {
  switch (icon) {
    case 'chat':     return <MessageSquare size={17} strokeWidth={1.5} />;
    case 'memory':   return <Brain size={17} strokeWidth={1.5} />;
    case 'mind':     return <Bot size={17} strokeWidth={1.5} />;
    case 'journal':  return <Feather size={17} strokeWidth={1.5} />;
    case 'import':   return <ArrowDownToLine size={17} strokeWidth={1.5} />;
    case 'projects': return <Layers size={17} strokeWidth={1.5} />;
    case 'profile':  return <User size={17} strokeWidth={1.5} />;
    case 'bell':     return <Activity size={17} strokeWidth={1.5} />;
    case 'new':      return <Plus size={17} strokeWidth={1.8} />;
    case 'settings': return <Cog size={17} strokeWidth={1.5} />;
    default:         return null;
  }
}
