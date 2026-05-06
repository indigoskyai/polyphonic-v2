import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/hooks/useDialogFocus';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  showEsc?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  /** When false, no backdrop element is rendered (drawer floats over the page without dimming/blurring it). */
  showBackdrop?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
}

export function Drawer({
  open,
  onClose,
  width,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  showBackdrop = true,
  children,
  ariaLabel,
}: DrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => {
    if (closeOnEsc) onClose();
  }, [closeOnEsc, onClose]);

  useDialogFocus({
    active: open,
    containerRef,
    onEscape: closeOnEsc ? handleEscape : undefined,
  });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (open) node.removeAttribute('inert');
    else node.setAttribute('inert', '');
  }, [open]);

  useEffect(() => {
    if (!open || showBackdrop || !closeOnBackdropClick) return;
    const onDocPointer = (e: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      onClose();
    };
    // Defer to avoid catching the click that opened the drawer.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocPointer);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDocPointer);
    };
  }, [open, closeOnBackdropClick, showBackdrop, onClose]);

  return createPortal(
    <>
      {showBackdrop && (
        <div
          className="drawer-backdrop"
          data-open={open ? 'true' : undefined}
          onClick={() => closeOnBackdropClick && onClose()}
          aria-hidden="true"
        />
      )}
      <div
        ref={containerRef}
        className="drawer"
        data-open={open ? 'true' : undefined}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-hidden={open ? undefined : 'true'}
        aria-label={ariaLabel}
        tabIndex={-1}
        style={width ? { width: `min(${width}px, calc(100vw - (var(--inset-gap) * 2)))` } : undefined}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/* ═══ Sub-components ═══ */

export function DrawerHeader({ children }: { children: React.ReactNode }) {
  return <div className="drawer-header">{children}</div>;
}

export function DrawerCrumb({ num, label }: { num?: string | number; label: string }) {
  return (
    <span className="drawer-crumb">
      {num != null && <span className="drawer-crumb-num">{num}</span>}
      {num != null && <span className="drawer-crumb-sep"> / </span>}
      {label}
    </span>
  );
}

export function DrawerTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="drawer-title">{children}</h2>;
}

export function DrawerEscChip({ label = 'ESC' }: { label?: string }) {
  return <span className="drawer-esc-chip">{label}</span>;
}

export function DrawerCloseBtn({ onClick, ariaLabel = 'Close drawer' }: { onClick: () => void; ariaLabel?: string }) {
  return (
    <button type="button" className="drawer-close-btn" onClick={onClick} aria-label={ariaLabel}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        <path d="M3 3 L11 11 M11 3 L3 11" />
      </svg>
    </button>
  );
}

export function DrawerBody({ children }: { children: React.ReactNode }) {
  return <div className="drawer-body">{children}</div>;
}

export function DrawerSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`drawer-section${className ? ` ${className}` : ''}`}>{children}</section>;
}

export function DrawerSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="drawer-section-label">{children}</div>;
}

export function DrawerFooter({ children }: { children: React.ReactNode }) {
  return <div className="drawer-footer">{children}</div>;
}

export function DrawerFooterSep() {
  return <span className="drawer-footer-sep" aria-hidden="true" />;
}

export default Drawer;
