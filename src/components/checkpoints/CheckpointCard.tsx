import React, { useState } from 'react';
import { Pill } from '@/components/ui/luca';
import DiffViewer from './DiffViewer';
import RestoreConfirmModal from './RestoreConfirmModal';
import { useCheckpointStore, type Checkpoint } from '@/stores/checkpointStore';
import { useToast } from '@/hooks/use-toast';

interface Props {
  checkpoint: Checkpoint;
  selectedForCompare: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function CheckpointCard({ checkpoint, selectedForCompare }: Props) {
  const { toast } = useToast();
  const expanded = useCheckpointStore((s) => s.expandedIds.has(checkpoint.id));
  const openFilesSet = useCheckpointStore((s) => s.openFiles[checkpoint.id]) ?? new Set<string>();
  const toggleExpand = useCheckpointStore((s) => s.toggleExpand);
  const toggleFileOpen = useCheckpointStore((s) => s.toggleFileOpen);
  const selectForCompare = useCheckpointStore((s) => s.selectForCompare);
  const restore = useCheckpointStore((s) => s.restore);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    setRestoring(true);
    const res = await restore(checkpoint.id);
    setRestoring(false);
    setConfirmOpen(false);
    if (res.ok) {
      toast({ title: 'Restored', description: `State reverted to ${formatTime(checkpoint.createdAt)}.` });
    } else {
      toast({ title: 'Restore failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="cp-card-wrap">
      <span
        className={`cp-dot${checkpoint.milestone ? ' cp-dot--milestone' : ' cp-dot--incremental'}`}
        aria-hidden="true"
      />
      <article className="cp-card" data-selected={selectedForCompare ? 'true' : undefined}>
        <header className="cp-card-header">
          <span className="cp-time">{relativeTime(checkpoint.createdAt)} · {formatTime(checkpoint.createdAt)}</span>
          <span className={`cp-agent-dot cp-agent-dot--${checkpoint.agent}`} aria-hidden="true" />
          <span className="cp-agent-name">{checkpoint.agent}</span>
          <button
            type="button"
            className="cp-expand-toggle"
            onClick={() => toggleExpand(checkpoint.id)}
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </header>
        <div className="cp-summary">{checkpoint.summary}</div>
        {checkpoint.annotation && <div className="cp-annotation">{checkpoint.annotation}</div>}

        <div className="cp-stats">
          {checkpoint.filesAdded > 0 && <span className="cp-stat cp-stat--add">+{checkpoint.filesAdded} files</span>}
          {checkpoint.filesRemoved > 0 && <span className="cp-stat cp-stat--del">-{checkpoint.filesRemoved} files</span>}
          {checkpoint.milestone && <span className="cp-milestone-chip">MILESTONE</span>}
        </div>

        {expanded && (
          <>
            <div className="cp-files">
              {checkpoint.files.length === 0 && (
                <div className="cp-files-empty">No file detail recorded for this checkpoint.</div>
              )}
              {checkpoint.files.map((file) => {
                const isOpen = openFilesSet.has(file.path);
                return (
                  <React.Fragment key={file.path}>
                    <button
                      type="button"
                      className="cp-file-row"
                      data-open={isOpen ? 'true' : undefined}
                      onClick={() => toggleFileOpen(checkpoint.id, file.path)}
                    >
                      <span className="cp-file-path">{file.path}</span>
                      <span className="cp-file-add">{file.added ? `+${file.added}` : ''}</span>
                      <span className="cp-file-del">{file.removed ? `-${file.removed}` : ''}</span>
                      <span className="cp-file-chev" aria-hidden="true">›</span>
                    </button>
                    {isOpen && <DiffViewer hunks={file.diff} loading={file.diffLoading} />}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="cp-card-footer">
              <Pill variant="primary" size="sm" onClick={() => setConfirmOpen(true)} disabled={restoring}>
                {restoring ? 'Restoring…' : 'Restore to this checkpoint'}
              </Pill>
              <Pill
                variant={selectedForCompare ? 'secondary' : 'ghost'}
                size="sm"
                active={selectedForCompare}
                onClick={() => selectForCompare(checkpoint.id)}
              >
                {selectedForCompare ? 'Selected · Deselect' : 'Select to compare'}
              </Pill>
            </div>
          </>
        )}
      </article>
      <RestoreConfirmModal
        open={confirmOpen}
        checkpointTime={formatTime(checkpoint.createdAt)}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleRestore}
      />
    </div>
  );
}
