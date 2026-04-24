import React, { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';

export default function ConnectionBanner() {
  const connected = useConnectionStore((s) => s.connected);
  const subscribe = useConnectionStore((s) => s.subscribe);
  const retry = useConnectionStore((s) => s.retry);

  useEffect(() => {
    const unsub = subscribe();
    return unsub;
  }, [subscribe]);

  if (connected) return null;

  return (
    <div className="conn-banner" role="alert" aria-live="assertive">
      <span className="conn-banner-dot" aria-hidden="true" />
      <span>Connection lost. Reconnecting…</span>
      <button type="button" className="conn-banner-action" onClick={retry}>Retry now</button>
    </div>
  );
}
