import { useLocation } from 'react-router-dom';
import { useSidebarStore } from '@/stores/sidebarStore';
import SidebarChat from './sidebar/SidebarChat';
import SidebarMemory from './sidebar/SidebarMemory';
import SidebarMind from './sidebar/SidebarMind';
import SidebarProfile from './sidebar/SidebarProfile';
import SidebarImport from './sidebar/SidebarImport';
import SidebarSettings from './sidebar/SidebarSettings';

export default function Sidebar() {
  const visible = useSidebarStore((s) => s.visible);
  const path = useLocation().pathname;

  const Content =
    path.startsWith('/memory') ? SidebarMemory
    : path.startsWith('/mind') ? SidebarMind
    : path.startsWith('/profile') ? SidebarProfile
    : path.startsWith('/import') ? SidebarImport
    : path.startsWith('/settings') ? SidebarSettings
    : SidebarChat;

  return (
    <div
      className="flex-shrink-0 overflow-hidden"
      style={{
        width: visible ? 'var(--sidebar-width)' : 0,
        minWidth: visible ? 'var(--sidebar-width)' : 0,
        marginRight: visible ? 0 : 'calc(-1 * var(--inset-gap))',
        opacity: visible ? 1 : 0,
        background: 'var(--canvas)',
        border: visible ? '1px solid var(--border-faint)' : '1px solid transparent',
        borderRadius: 'var(--radius-inset)',
        boxShadow: visible ? 'var(--shadow-panel), var(--shadow-inset-highlight)' : 'none',
        transition: visible
          ? 'width 560ms var(--ease-premium), min-width 560ms var(--ease-premium), margin-right 560ms var(--ease-premium), opacity 320ms var(--ease-out) 200ms, border-color 320ms var(--ease-out) 200ms, box-shadow 320ms var(--ease-out) 200ms'
          : 'width 560ms var(--ease-premium), min-width 560ms var(--ease-premium), margin-right 560ms var(--ease-premium), opacity 240ms var(--ease-out), border-color 240ms var(--ease-out), box-shadow 240ms var(--ease-out)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="flex flex-col"
        style={{ width: 'var(--sidebar-width)', height: '100%' }}
      >
        <Content />
      </div>
    </div>
  );
}
