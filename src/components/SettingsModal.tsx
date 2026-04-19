import { useEffect, useRef } from 'react';
import SettingsView from '@/pages/SettingsView';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        animation: 'settingsOverlayIn 300ms var(--ease-premium) both',
      }}
      onClick={onClose}
    >
      {/* Blurred backdrop */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'rgba(6, 6, 8, 0.65)',
        }}
      />

      {/* Floating card */}
      <div
        className="relative flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(780px, 90vw)',
          height: 'min(600px, 85vh)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25), 0 4px 12px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.02)',
          animation: 'settingsCardIn 400ms var(--ease-premium) both',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-md flex items-center justify-center cursor-pointer"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-ghost)',
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'var(--bg-surface)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-ghost)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>

        <SettingsView />
      </div>
    </div>
  );
}
