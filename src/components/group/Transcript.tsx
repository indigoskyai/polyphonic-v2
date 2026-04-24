import React, { useEffect, useRef } from 'react';
import { useGroupSessionStore } from '@/stores/groupSessionStore';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Transcript() {
  const transcript = useGroupSessionStore((s) => s.transcript);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [transcript.length, transcript[transcript.length - 1]?.text]);

  return (
    <div className="transcript" ref={ref} role="log" aria-live="polite">
      {transcript.length === 0 && (
        <div className="transcript-empty">Awaiting conversation…</div>
      )}
      {transcript.map((e) => (
        <div
          key={e.id}
          className="transcript-entry"
          data-agent={e.agent}
          data-partial={e.partial ? 'true' : undefined}
        >
          <span className="transcript-time">{formatTime(e.ts)}</span>
          <span className="transcript-role">{e.agent}</span>
          <span className="transcript-body">{e.text}</span>
        </div>
      ))}
    </div>
  );
}
