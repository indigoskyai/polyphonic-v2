import React from 'react';

interface Props {
  visible: boolean;
  text?: string;
}

export default function AttachmentDropOverlay({ visible, text = 'Drop files to attach' }: Props) {
  return (
    <div className="drag-overlay" data-visible={visible ? 'true' : undefined} aria-hidden={!visible}>
      <span className="drag-overlay-text">{text}</span>
    </div>
  );
}
