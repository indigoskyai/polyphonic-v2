import React, { useEffect } from 'react';
import { EmptyState } from '@/components/ui/luca';
import CheckpointTimeline from '@/components/checkpoints/CheckpointTimeline';
import CompareBar from '@/components/checkpoints/CompareBar';
import { useAuthStore } from '@/stores/authStore';
import { useCheckpointStore } from '@/stores/checkpointStore';

export default function CheckpointsView() {
  const user = useAuthStore((s) => s.user);
  const load = useCheckpointStore((s) => s.load);
  const subscribe = useCheckpointStore((s) => s.subscribe);
  const loading = useCheckpointStore((s) => s.loading);
  const checkpoints = useCheckpointStore((s) => s.checkpoints);

  useEffect(() => {
    if (!user) return;
    load(user.id);
    const unsub = subscribe(user.id);
    return unsub;
  }, [user, load, subscribe]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      <header className="cp-page-header">
        <h1 className="cp-page-title">Checkpoints</h1>
        <div style={{ flex: 1 }} />
        <CompareBar />
      </header>
      <div className="cp-page-body">
        {loading && <div style={{ color: 'var(--text-ghost)', fontSize: 12 }}>Loading checkpoints…</div>}
        {!loading && checkpoints.length === 0 && (
          <EmptyState
            text="No checkpoints yet"
            hint="They'll appear here as work progresses."
          />
        )}
        {!loading && checkpoints.length > 0 && <CheckpointTimeline />}
      </div>
    </div>
  );
}
