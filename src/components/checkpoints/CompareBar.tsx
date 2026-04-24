import React, { useState } from 'react';
import { Pill, Modal, SegmentControl } from '@/components/ui/luca';
import DiffViewer from './DiffViewer';
import { useCheckpointStore } from '@/stores/checkpointStore';

export default function CompareBar() {
  const [a, b] = useCheckpointStore((s) => s.selectedForCompare);
  const clearCompare = useCheckpointStore((s) => s.clearCompare);
  const runCompare = useCheckpointStore((s) => s.runCompare);
  const compareResult = useCheckpointStore((s) => s.compareResult);
  const compareLoading = useCheckpointStore((s) => s.compareLoading);

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<'unified' | 'split'>('unified');

  const count = (a ? 1 : 0) + (b ? 1 : 0);

  const openCompare = async () => {
    setModalOpen(true);
    if (!compareResult) await runCompare();
  };

  const closeCompare = () => {
    setModalOpen(false);
  };

  return (
    <>
      <div className="cp-compare-bar">
        {count === 0 && <span className="cp-compare-hint">Select two checkpoints to compare</span>}
        {count === 1 && (
          <>
            <span className="cp-compare-hint">1 of 2 selected</span>
            <Pill size="xs" variant="ghost" onClick={clearCompare}>Clear</Pill>
          </>
        )}
        {count === 2 && (
          <>
            <span className="cp-compare-hint">2 of 2 selected</span>
            <Pill size="xs" variant="primary" onClick={openCompare}>Compare</Pill>
            <Pill size="xs" variant="ghost" onClick={clearCompare}>Clear</Pill>
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={closeCompare} title="Compare checkpoints" width={880}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <SegmentControl
            options={[{ value: 'unified', label: 'Unified' }, { value: 'split', label: 'Split' }]}
            value={mode}
            onChange={(v) => setMode(v as 'split' | 'unified')}
          />
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {compareLoading && <div style={{ color: 'var(--text-ghost)', fontSize: 12 }}>Loading diff…</div>}
          {!compareLoading && compareResult && compareResult.files.length === 0 && (
            <div style={{ color: 'var(--text-ghost)', fontSize: 12 }}>No changes between these checkpoints.</div>
          )}
          {!compareLoading && compareResult?.files.map((f) => (
            <div key={f.path} className="cp-compare-file">
              <div className="cp-compare-file-head">
                <span className="cp-file-path">{f.path}</span>
                <span className="cp-stat cp-stat--add">+{f.added}</span>
                <span className="cp-stat cp-stat--del">-{f.removed}</span>
              </div>
              {mode === 'unified' ? (
                <DiffViewer hunks={f.hunks} />
              ) : (
                <div className="cp-compare-split">
                  <DiffViewer hunks={f.hunks} />
                  <DiffViewer hunks={f.hunks} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
