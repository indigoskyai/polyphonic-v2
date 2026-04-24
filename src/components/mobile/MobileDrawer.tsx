import React from 'react';
import { useMobileShellStore } from '@/stores/mobileShellStore';

export interface MobileDrawerThread {
  id: string;
  title: string;
  active?: boolean;
}

interface Props {
  threads: MobileDrawerThread[];
  onSelect?: (id: string) => void;
}

export default function MobileDrawer({ threads, onSelect }: Props) {
  const open = useMobileShellStore((s) => s.drawerOpen);
  const close = useMobileShellStore((s) => s.closeDrawer);
  return (
    <>
      <div
        className="m-drawer-backdrop"
        data-open={open ? 'true' : undefined}
        onClick={close}
        aria-hidden={!open}
      />
      <aside
        className="m-drawer"
        data-open={open ? 'true' : undefined}
        role="dialog"
        aria-label="Threads"
      >
        <div className="m-drawer-header">Threads</div>
        <div className="m-drawer-body">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              className="m-thread-item"
              data-active={t.active ? 'true' : undefined}
              onClick={() => {
                onSelect?.(t.id);
                close();
              }}
            >
              {t.title}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
