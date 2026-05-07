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
 * WelcomeBackCard — the small italic note above the composer when Luca did
 * something while the user was away. Clicking opens the activity timeline
 * drawer (or, for explicit initiations, drops the message into the composer).
 */
export default function WelcomeBackCard({ data, onUseAsInput, onDismiss }: Props) {
  const openDrawer = useDrawerStore((s) => s.open);

  const eyebrow =
    data.type === 'initiation'
      ? "i\u2019ve been thinking about something..."
      : data.type === 'journal'
        ? 'while you were away...'
        : 'a thought surfaced...';

  const handleClick = () => {
    if (data.type === 'initiation') {
      onUseAsInput(data.content);
      onDismiss();
      return;
    }
    // For surfaced activity / journal, open the full timeline so the user can
    // see *everything* that happened — not just this one snippet.
    openDrawer('activity-timeline');
    onDismiss();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        all: 'unset',
        display: 'block',
        maxWidth: 400,
        margin: '20px auto 0',
        animation: 'viewFadeIn 0.8s var(--ease-out) 0.4s both',
        cursor: 'pointer',
        textAlign: 'center',
      }}
      aria-label="Open activity timeline"
    >
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-whisper)',
          display: 'block',
          marginBottom: 10,
        }}
      >
        {eyebrow}
      </span>
      <span
        style={{
          fontSize: 16,
          lineHeight: 1.6,
          color: 'var(--text-ghost)',
          fontStyle: 'italic',
          display: 'block',
        }}
      >
        {data.content}
      </span>
      {data.type !== 'initiation' && (
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-whisper)',
            display: 'block',
            marginTop: 10,
          }}
        >
          tap to see everything
        </span>
      )}
    </button>
  );
}
