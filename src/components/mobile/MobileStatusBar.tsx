import React, { useEffect, useState } from 'react';

function formatTime(): string {
  const d = new Date();
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function MobileStatusBar() {
  const [time, setTime] = useState(formatTime());
  useEffect(() => {
    const t = window.setInterval(() => setTime(formatTime()), 30000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="m-status-bar">
      <span>{time}</span>
      <span className="m-status-icons" aria-hidden="true">
        <svg viewBox="0 0 12 12" fill="currentColor"><rect x="0" y="8" width="2" height="4" /><rect x="3" y="6" width="2" height="6" /><rect x="6" y="3" width="2" height="9" /><rect x="9" y="0" width="2" height="12" /></svg>
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.2}><path d="M2 5a6 6 0 0 1 8 0" /><path d="M4 7a3 3 0 0 1 4 0" /><circle cx="6" cy="9" r="0.8" fill="currentColor" stroke="none" /></svg>
        <svg viewBox="0 0 14 8" fill="none" stroke="currentColor" strokeWidth={1}><rect x="0.5" y="0.5" width="11" height="7" rx="1.5" /><rect x="2" y="2" width="8" height="4" rx="0.5" fill="currentColor" /><rect x="12" y="2.5" width="1.5" height="3" rx="0.5" fill="currentColor" /></svg>
      </span>
    </div>
  );
}
