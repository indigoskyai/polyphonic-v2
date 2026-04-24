import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pill } from '@/components/ui/luca';
import { usePermissionModalStore } from '@/stores/permissionModalStore';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function PermissionModal() {
  const active = usePermissionModalStore((s) => s.active);
  const dismiss = usePermissionModalStore((s) => s.dismiss);
  const ref = useRef<HTMLDivElement | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const t = requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss(true);
      }
      if (e.key === 'Tab' && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (nodes.length === 0) { e.preventDefault(); return; }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const act = document.activeElement as HTMLElement | null;
        if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [active, dismiss]);

  if (!active) return null;

  return createPortal(
    <div
      className="perm-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss(true);
      }}
    >
      <div
        ref={ref}
        className="perm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={active.title}
      >
        <header className="perm-modal-header">
          <div className="perm-modal-icon-circle" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div>
            <div className="perm-modal-title">{active.title}</div>
            <div className="perm-modal-subtitle">{active.subtitle}</div>
          </div>
        </header>
        {active.affected.length > 0 && (
          <div className="perm-modal-affected" role="list">
            {active.affected.map((a, i) => (
              <div key={i} className={a.destructive ? 'destructive' : undefined} role="listitem">
                {a.destructive ? '×' : '·'} {a.label}
              </div>
            ))}
          </div>
        )}
        <footer className="perm-modal-footer">
          <Pill variant="ghost" size="sm" onClick={() => dismiss(true)}>Cancel</Pill>
          <Pill
            variant="destructive"
            size="sm"
            onClick={() => {
              active.onConfirm();
              dismiss(false);
            }}
          >
            {active.confirmLabel || 'Confirm'}
          </Pill>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
