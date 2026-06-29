import React from 'react';
import { useDrawerStore } from '@/stores/drawerStore';

export interface WelcomeBackData {
  type: 'journal' | 'thought' | 'initiation';
  content: string;
}

interface Props {
  data: WelcomeBackData;
  onUseAsInput: (text: string) => void;
  onDismiss: () => void;
}

/**
 * WelcomeBackCard — compact whisper chip above the composer when Luca did
 * something while the user was away. Single line by default; clicking opens
 * the activity timeline (or, for explicit initiations, drops the message
 * into the composer).
 *
 * Replaces the previous expanded italic paragraph treatment that dominated
 * the empty-state hero. Now the composer is the visual center; this chip
 * is supportive ambient context.
 */
export default function WelcomeBackCard({ data, onUseAsInput, onDismiss }: Props) {
  const openDrawer = useDrawerStore((s) => s.open);

  const eyebrow =
    data.type === 'initiation'
      ? "luca’s been thinking"
      : data.type === 'journal'
        ? 'while you were away'
        : 'a thought surfaced';

  // Compress content to a single line for the whisper preview.
  const preview = data.content.replace(/\s+/g, ' ').trim();

  const handleClick = () => {
    if (data.type === 'initiation') {
      onUseAsInput(data.content);
      onDismiss();
      return;
    }
    openDrawer('activity-timeline');
    onDismiss();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        // Cap to 540px desktop, but stay within viewport on mobile — the
        // 32px buffer matches the chat-empty-composer's natural side gutter.
        width: '100%',
        maxWidth: 'min(540px, calc(100vw - 32px))',
        boxSizing: 'border-box',
        padding: '7px 14px',
        margin: '0 auto',
        background: 'rgba(255, 255, 255, 0.018)',
        border: '1px solid var(--border-faint)',
        borderRadius: 999,
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
        animation: 'viewFadeIn 0.6s var(--ease-out) 0.3s both',
        transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--sage-overlay-hover)';
        e.currentTarget.style.borderColor = 'var(--sage-border-focus)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.018)';
        e.currentTarget.style.borderColor = 'var(--border-faint)';
      }}
      aria-label={`${eyebrow}. ${preview.slice(0, 80)}. Click to expand.`}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--luca-full, #60a5fa)',
          flex: '0 0 5px',
          animation: 'breathe 5s ease-in-out infinite',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-soft)',
          flex: '0 0 auto',
        }}
      >
        {eyebrow}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontStyle: 'italic',
          color: 'var(--text-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: 1,
          lineHeight: 1.4,
        }}
      >
        {preview}
      </span>
    </button>
  );
}
