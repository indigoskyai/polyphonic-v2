import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSidebarStore } from '@/stores/sidebarStore';
import SidebarChat from './sidebar/SidebarChat';
import SidebarMemory from './sidebar/SidebarMemory';
import SidebarMind from './sidebar/SidebarMind';
import SidebarProfile from './sidebar/SidebarProfile';
import SidebarImport from './sidebar/SidebarImport';
import SidebarProjects from './sidebar/SidebarProjects';
import SidebarSettings from './sidebar/SidebarSettings';
import SidebarJournal from './sidebar/SidebarJournal';

/**
 * Sidebar — toggleable per-section content panel.
 *
 * Width is user-resizable via a drag handle on the right edge, persisted
 * to localStorage via sidebarStore. During an active drag we suspend the
 * width transition so the panel tracks the cursor 1:1 (without that, the
 * 560ms ease lags the drag by ~35 frames). The handle itself is invisible
 * at rest, faintly lit on hover, and the cursor changes to col-resize so
 * the affordance is discoverable without visual noise.
 */
export default function Sidebar() {
  const visible = useSidebarStore((s) => s.visible);
  const width = useSidebarStore((s) => s.width);
  const setWidth = useSidebarStore((s) => s.setWidth);
  const path = useLocation().pathname;

  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const Content =
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

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = { startX: e.clientX, startWidth: width };
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      setWidth(s.startWidth + (ev.clientX - s.startX));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      dragStateRef.current = null;
      setIsDragging(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Suspend width transition during drag so the panel tracks the cursor 1:1.
  const widthTransition = isDragging
    ? 'none'
    : visible
      ? 'width 560ms var(--ease-premium), min-width 560ms var(--ease-premium), margin-right 560ms var(--ease-premium), opacity 320ms var(--ease-out) 200ms, border-color 320ms var(--ease-out) 200ms, box-shadow 320ms var(--ease-out) 200ms'
      : 'width 560ms var(--ease-premium), min-width 560ms var(--ease-premium), margin-right 560ms var(--ease-premium), opacity 240ms var(--ease-out), border-color 240ms var(--ease-out), box-shadow 240ms var(--ease-out)';

  return (
    <div
      className="flex-shrink-0 overflow-hidden"
      style={{
        position: 'relative',
        width: visible ? width : 0,
        minWidth: visible ? width : 0,
        marginRight: visible ? 0 : 'calc(-1 * var(--inset-gap))',
        opacity: visible ? 1 : 0,
        background: 'var(--canvas)',
        border: visible ? '1px solid var(--border-faint)' : '1px solid transparent',
        borderRadius: 'var(--radius-inset)',
        boxShadow: visible ? 'var(--shadow-panel), var(--shadow-inset-highlight)' : 'none',
        transition: widthTransition,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="flex flex-col"
        style={{ width, height: '100%' }}
      >
        <Content />
      </div>

      {visible && (
        <div
          className={`sidebar-resize-handle${isDragging ? ' dragging' : ''}`}
          onMouseDown={onResizeStart}
          aria-hidden="true"
          title="Drag to resize"
        />
      )}
    </div>
  );
}
