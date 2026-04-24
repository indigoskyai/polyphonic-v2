import React from 'react';
import type { Attachment } from '@/stores/attachmentStore';

interface Props {
  attachment: Attachment;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function AttachmentChip({ attachment, onRemove }: Props) {
  return (
    <span className="att-chip" data-status={attachment.status}>
      <svg className="att-chip-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 2h6l3 3v9H4V2z" />
        <path d="M10 2v3h3" />
      </svg>
      <span className="att-chip-name">{attachment.name}</span>
      <span className="att-chip-size">{formatSize(attachment.size)}</span>
      <button
        type="button"
        className="att-chip-remove"
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
      >
        <svg viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M1 1 L8 8 M8 1 L1 8" />
        </svg>
      </button>
    </span>
  );
}
