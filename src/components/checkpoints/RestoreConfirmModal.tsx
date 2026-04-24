import React from 'react';
import { Modal, Pill } from '@/components/ui/luca';

interface Props {
  open: boolean;
  checkpointTime: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function RestoreConfirmModal({ open, checkpointTime, onCancel, onConfirm }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title="Restore to this checkpoint?" width={480}>
      <p style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.55, margin: '0 0 20px' }}>
        This will revert your working state to <strong style={{ color: 'var(--text-primary)' }}>{checkpointTime}</strong>.
        Files modified after this point will be lost. A new checkpoint of the current state will be
        saved automatically before the restore.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Pill variant="ghost" size="sm" onClick={onCancel}>Cancel</Pill>
        <Pill variant="destructive" size="sm" onClick={onConfirm}>Restore</Pill>
      </div>
    </Modal>
  );
}
