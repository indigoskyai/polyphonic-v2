import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import WidgetTile from './WidgetTile';

/** Top recurring tags rendered as orbits — tighter orbit = more frequent. */
export default function RecurrenceOrbits({ dragHandleProps }: { dragHandleProps?: Record<string, any> }) {
  const user = useAuthStore((s) => s.user);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('engrams')
        .select('tags')
        .eq('user_id', user.id)
        .not('tags', 'is', null)
        .limit(2000);
      if (cancelled || !data) return;
      const counts: Record<string, number> = {};
      for (const row of data) {
        for (const t of (row.tags as string[] | null) ?? []) counts[t] = (counts[t] ?? 0) + 1;
      }
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count }));
      setTags(sorted);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const max = useMemo(() => Math.max(1, ...tags.map((t) => t.count)), [tags]);

  return (
    <WidgetTile
      title="Recurring themes"
      subtitle={`top ${tags.length}`}
      empty={tags.length === 0}
      dragHandleProps={dragHandleProps}
    >
      <svg viewBox="-60 -60 120 120" style={{ width: '100%', height: '100%', display: 'block' }}>
        <circle r="2" fill="rgba(201,168,124,0.5)" />
        {tags.map((t, i) => {
          const orbitR = 14 + (1 - t.count / max) * 36;
          const angle = (i / tags.length) * Math.PI * 2;
          const x = Math.cos(angle) * orbitR;
          const y = Math.sin(angle) * orbitR;
          return (
            <g key={t.tag}>
              <circle cx={0} cy={0} r={orbitR} fill="none" stroke="rgba(220,219,216,0.04)" />
              <circle cx={x} cy={y} r={1.6 + (t.count / max) * 2.2} fill="rgba(244,243,240,0.7)" />
              <text x={x + 3} y={y + 1.5} fontSize="5.5" fill="rgba(202,200,196,0.62)" fontFamily="var(--font-mono), monospace">
                {t.tag.slice(0, 14)}
              </text>
            </g>
          );
        })}
      </svg>
    </WidgetTile>
  );
}
