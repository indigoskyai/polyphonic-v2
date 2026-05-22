import { useEffect } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';

/**
 * ConnectionBanner — shown when the Supabase realtime channel is down.
 *
 * Renders the last connection status reason under the headline so silent
 * failures stop being silent. Subscribes to the realtime presence channel
 * on mount; the store handles teardown when no subscribers remain.
 */
export default function ConnectionBanner() {
  const connected = useConnectionStore((s) => s.connected);
  const visible = useConnectionStore((s) => s.visible);
  const reason = useConnectionStore((s) => s.reason);
  const subscribe = useConnectionStore((s) => s.subscribe);
  const retry = useConnectionStore((s) => s.retry);

  useEffect(() => {
    const unsub = subscribe();
    return unsub;
  }, [subscribe]);

  if (connected || !visible) return null;

  return (
    <div className="conn-banner" role="status" aria-live="polite">
      <span className="conn-banner-dot" aria-hidden="true" />
      <div className="conn-banner-body">
        <div className="conn-banner-headline">Realtime reconnecting</div>
        {reason && (
          <div className="conn-banner-reason" aria-live="polite">
            {reason}
          </div>
        )}
      </div>
      <button type="button" className="conn-banner-action" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
