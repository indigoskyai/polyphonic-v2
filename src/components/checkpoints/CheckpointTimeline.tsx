import React from 'react';
import CheckpointCard from './CheckpointCard';
import { useCheckpointStore } from '@/stores/checkpointStore';

export default function CheckpointTimeline() {
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const selected = useCheckpointStore((s) => s.selectedForCompare);

  return (
    <div className="cp-timeline" role="list">
      {checkpoints.map((cp) => (
        <div key={cp.id} role="listitem">
          <CheckpointCard
            checkpoint={cp}
            selectedForCompare={selected[0] === cp.id || selected[1] === cp.id}
          />
        </div>
      ))}
    </div>
  );
}
