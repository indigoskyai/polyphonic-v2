import { useState, useEffect } from 'react';

export default function Clockbar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const h = time.getHours() % 12 || 12;
  const m = String(time.getMinutes()).padStart(2, '0');
  const s = String(time.getSeconds()).padStart(2, '0');
  const dayProgress = ((time.getHours() * 60 + time.getMinutes()) / 1440) * 100;

  return (
    <div
      className="flex items-center flex-shrink-0 z-10"
      style={{
        height: 36,
        background: 'var(--bg-void)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '0 20px',
        gap: 18,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Clock */}
      <span style={{ fontSize: 15, fontWeight: 300, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}>
        {h}
        <span style={{ animation: 'clockbeat 1s ease-in-out infinite' }}>:</span>
        {m}
        <span style={{ fontSize: 10, color: 'var(--text-ghost)', marginLeft: 2, fontWeight: 300 }}>{s}</span>
      </span>

      {/* Day timeline */}
      <div className="flex-1 relative" style={{ height: 14, minWidth: 60 }}>
        <div className="absolute left-0 right-0" style={{ top: 6, height: 1, background: 'rgba(220, 219, 216, 0.03)' }} />
        <div className="absolute" style={{ top: 2, width: 1, height: 10, background: 'var(--text-ghost)', boxShadow: '0 0 3px rgba(210, 205, 195, 0.06)', left: `${dayProgress}%` }} />
      </div>

      {/* Session */}
      <div className="flex items-center gap-1.5 ml-auto">
        <div className="relative overflow-hidden" style={{ width: 60, height: 3, background: 'rgba(220, 219, 216, 0.03)', borderRadius: 2 }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'rgba(201, 168, 124, 0.18)', width: '42%' }} />
          <div className="absolute" style={{ top: -2, height: 7, width: 1, background: 'rgba(220, 219, 216, 0.06)', left: '50%' }} />
        </div>
        <span className="uppercase" style={{ fontSize: 7, color: 'var(--text-ghost)', letterSpacing: '0.04em' }}>session</span>
      </div>
    </div>
  );
}
