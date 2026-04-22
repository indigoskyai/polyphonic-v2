import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import WidgetTile from './WidgetTile';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 7×N heatmap of engram creation density. */
export default function WeeklyHeatmap({ dragHandleProps }: { dragHandleProps?: Record<string, any> }) {
  const user = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 84 * 86400_000).toISOString(); // 12 weeks
      const { data } = await supabase
        .from('engrams')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .limit(5000);
      if (cancelled || !data) return;
      const map = new Map<string, number>();
      for (const row of data) {
        const d = new Date(row.created_at);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      setCounts(map);
      setTotal(data.length);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const grid = useMemo(() => {
    const weeks = 12;
    const cols: { day: Date; count: number }[][] = [];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    // Align to most recent Saturday so weeks read S→S left-to-right.
    for (let w = weeks - 1; w >= 0; w--) {
      const col: { day: Date; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(today.getTime() - (w * 7 + (6 - d)) * 86400_000);
        const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
        col.push({ day, count: counts.get(key) ?? 0 });
      }
      cols.push(col);
    }
    return cols;
  }, [counts]);

  const max = useMemo(() => {
    let m = 0;
    for (const col of grid) for (const c of col) if (c.count > m) m = c.count;
    return Math.max(1, m);
  }, [grid]);

  return (
    <WidgetTile
      title="Weekly rhythm"
      subtitle={`${total} engrams · 12w`}
      empty={total === 0}
      dragHandleProps={dragHandleProps}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 4 }}>
          {DAYS.map((d, i) => (
            <div key={i} style={{ fontSize: 8, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${grid.length}, 1fr)`, gap: 2, flex: 1 }}>
          {grid.map((col, ci) => (
            <div key={ci} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: 2 }}>
              {col.map((cell, ri) => {
                const intensity = cell.count / max;
                return (
                  <div
                    key={ri}
                    title={`${cell.day.toLocaleDateString()} · ${cell.count}`}
                    style={{
                      background: cell.count === 0
                        ? 'rgba(220,219,216,0.025)'
                        : `rgba(201,168,124,${0.1 + intensity * 0.55})`,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </WidgetTile>
  );
}
