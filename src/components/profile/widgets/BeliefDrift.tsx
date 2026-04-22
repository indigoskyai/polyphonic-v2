import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import WidgetTile from './WidgetTile';

type Belief = {
  id: string;
  content: string;
  confidence: number;
  active: boolean | null;
  stagnant: boolean | null;
  updated_at: string | null;
  revision_history: any;
};

/** Sparkline-strip of the top-confidence beliefs and their movement. */
export default function BeliefDrift({ dragHandleProps }: { dragHandleProps?: Record<string, any> }) {
  const user = useAuthStore((s) => s.user);
  const [beliefs, setBeliefs] = useState<Belief[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('beliefs')
        .select('id, content, confidence, active, stagnant, updated_at, revision_history')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('confidence', { ascending: false })
        .limit(5);
      if (cancelled || !data) return;
      setBeliefs(data as Belief[]);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const sparks = useMemo(() => beliefs.map((b) => {
    const hist = Array.isArray(b.revision_history) ? b.revision_history : [];
    const points: number[] = [];
    for (const r of hist) {
      const v = r?.confidence ?? r?.new_confidence;
      if (typeof v === 'number') points.push(Math.max(0, Math.min(1, v)));
    }
    points.push(b.confidence);
    if (points.length < 2) points.unshift(b.confidence); // single-point: flat line
    return { ...b, points };
  }), [beliefs]);

  return (
    <WidgetTile
      title="Belief drift"
      subtitle={`${beliefs.length} active`}
      empty={beliefs.length === 0}
      dragHandleProps={dragHandleProps}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'hidden' }}>
        {sparks.map((b) => {
          const w = 60, h = 14;
          const min = Math.min(...b.points), max = Math.max(...b.points);
          const span = max - min || 0.001;
          const path = b.points.map((p, i) => {
            const x = (i / (b.points.length - 1)) * w;
            const y = h - ((p - min) / span) * h;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
          }).join(' ');
          const trend = b.points[b.points.length - 1] - b.points[0];
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
              <div
                style={{
                  flex: 1,
                  color: 'var(--text-soft)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  fontSize: 10,
                }}
                title={b.content}
              >
                {b.content}
              </div>
              <svg width={w} height={h} style={{ flexShrink: 0 }}>
                <path d={path} fill="none" stroke="rgba(201,168,124,0.6)" strokeWidth="1" />
              </svg>
              <div style={{
                width: 28, textAlign: 'right',
                color: trend > 0.02 ? 'rgba(140,200,160,0.7)' : trend < -0.02 ? 'rgba(220,140,140,0.7)' : 'var(--text-ghost)',
                fontFamily: 'var(--font-mono)', fontSize: 9,
              }}>
                {trend > 0 ? '+' : ''}{(trend * 100).toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
    </WidgetTile>
  );
}
