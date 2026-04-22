import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import WidgetTile from './WidgetTile';

/** 24-spoke radial showing when thoughts cluster across the day. */
export default function CircadianRadial({ dragHandleProps }: { dragHandleProps?: Record<string, any> }) {
  const user = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState<number[]>(Array(24).fill(0));
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data } = await supabase
        .from('thought_stream')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .limit(5000);
      if (cancelled || !data) return;
      const buckets = Array(24).fill(0);
      for (const row of data) buckets[new Date(row.created_at).getHours()]++;
      setCounts(buckets);
      setTotal(data.length);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const max = useMemo(() => Math.max(1, ...counts), [counts]);

  return (
    <WidgetTile
      title="Circadian rhythm"
      subtitle={`${total} thoughts · 30d`}
      empty={total === 0}
      dragHandleProps={dragHandleProps}
    >
      <svg viewBox="-60 -60 120 120" style={{ width: '100%', height: '100%', display: 'block' }}>
        <circle r="44" fill="none" stroke="rgba(220,219,216,0.04)" />
        <circle r="22" fill="none" stroke="rgba(220,219,216,0.025)" />
        {counts.map((c, h) => {
          const angle = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const len = 18 + (c / max) * 26;
          const x1 = Math.cos(angle) * 16;
          const y1 = Math.sin(angle) * 16;
          const x2 = Math.cos(angle) * len;
          const y2 = Math.sin(angle) * len;
          const intensity = c / max;
          return (
            <line
              key={h}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={`rgba(201,168,124,${0.15 + intensity * 0.55})`}
              strokeWidth={c > 0 ? 1.6 : 0.5}
              strokeLinecap="round"
            />
          );
        })}
        {[0, 6, 12, 18].map((h) => {
          const angle = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * 52;
          const y = Math.sin(angle) * 52;
          return (
            <text key={h} x={x} y={y + 2} fontSize="6" fill="rgba(156,154,150,0.42)" textAnchor="middle" fontFamily="var(--font-mono), monospace">
              {String(h).padStart(2, '0')}
            </text>
          );
        })}
      </svg>
    </WidgetTile>
  );
}
