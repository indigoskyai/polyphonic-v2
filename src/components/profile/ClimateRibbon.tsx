import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useProfileLayoutStore } from './profileLayoutStore';

/**
 * Climate Ribbon — emotional weather over time.
 *
 * Three stacked horizontal bands, all derived from `mnemos_emotional_state`
 * snapshots (or, when sparse, gracefully degrade to engram-derived valence).
 *
 *   [ Now      ] — current state, full-width single-day strip
 *   [ Past 30d ] — daily aggregates, scrubbable time cursor
 *   [ Forecast ] — faint dashed continuation, simple weekly cyclic mean
 *
 * Click anywhere in the past band to scrub a "time cursor" — the constellation
 * uses this to dim stars whose evidence post-dates the cursor.
 */

type Snapshot = {
  recorded_at: string;
  valence: number;
  arousal: number;
  certainty: number;
  social: number;
  dominance: number;
  temporal: number;
};

type DayBucket = {
  day: string; // ISO date
  ts: number;
  count: number;
  valence: number;
  arousal: number;
  certainty: number;
  warmth: number;     // ← derived from `social`
  restlessness: number; // ← derived from arousal*(1-certainty)
};

const DIMS = ['valence', 'arousal', 'certainty', 'warmth', 'restlessness'] as const;
type Dim = typeof DIMS[number];

// Soft palette — only existing tokens. Each dimension gets a tint.
const TINT: Record<Dim, [number, number, number]> = {
  valence:      [201, 168, 124], // luca warm
  arousal:      [220, 219, 216], // neutral bright
  certainty:    [140, 168, 156], // guardian cool
  warmth:       [201, 168, 124], // luca warm
  restlessness: [180, 140, 120], // dimmed warm
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

export default function ClimateRibbon() {
  const user = useAuthStore((s) => s.user);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 80 });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [hoveredDay, setHoveredDay] = useState<DayBucket | null>(null);

  const { timeCursor, setTimeCursor, setHoveredCategory } = useProfileLayoutStore();

  // ── Load 30 days of emotional snapshots ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from('mnemos_emotional_state')
        .select('recorded_at, valence, arousal, certainty, social, dominance, temporal')
        .eq('user_id', user.id)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .limit(2000);
      if (cancelled) return;
      if (!error && data) setSnapshots(data as Snapshot[]);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Bucket snapshots into days ──
  const days = useMemo<DayBucket[]>(() => {
    const buckets: Record<string, { sum: Record<string, number>; n: number; ts: number }> = {};
    for (const s of snapshots) {
      const d = new Date(s.recorded_at);
      const key = dayKey(d);
      if (!buckets[key]) {
        buckets[key] = { sum: { valence: 0, arousal: 0, certainty: 0, social: 0 }, n: 0, ts: d.setHours(12, 0, 0, 0) };
      }
      buckets[key].sum.valence  += s.valence  ?? 0;
      buckets[key].sum.arousal  += s.arousal  ?? 0;
      buckets[key].sum.certainty += s.certainty ?? 0;
      buckets[key].sum.social   += s.social   ?? 0;
      buckets[key].n += 1;
    }

    // Always emit 30 days (gaps render as quiet empty cells).
    const out: DayBucket[] = [];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400_000);
      const key = dayKey(d);
      const b = buckets[key];
      if (b && b.n > 0) {
        const v = b.sum.valence / b.n;
        const a = b.sum.arousal / b.n;
        const c = b.sum.certainty / b.n;
        const so = b.sum.social / b.n;
        out.push({
          day: key,
          ts: d.getTime(),
          count: b.n,
          valence: clamp01((v + 1) / 2),
          arousal: clamp01((a + 1) / 2),
          certainty: clamp01(c),
          warmth: clamp01((so + 1) / 2),
          restlessness: clamp01(((a + 1) / 2) * (1 - c)),
        });
      } else {
        out.push({ day: key, ts: d.getTime(), count: 0, valence: 0.5, arousal: 0.3, certainty: 0.5, warmth: 0.5, restlessness: 0.3 });
      }
    }
    return out;
  }, [snapshots]);

  // Forecast — simple weekly cyclic mean across last 28 days.
  const forecast = useMemo<DayBucket[]>(() => {
    if (days.length < 7) return [];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const result: DayBucket[] = [];
    for (let i = 1; i <= 2; i++) {
      const d = new Date(today.getTime() + i * 86400_000);
      const dow = d.getDay();
      const sameDow = days.filter((b) => new Date(b.ts).getDay() === dow && b.count > 0);
      if (sameDow.length === 0) {
        result.push({ day: dayKey(d), ts: d.getTime(), count: 0, valence: 0.5, arousal: 0.3, certainty: 0.5, warmth: 0.5, restlessness: 0.3 });
        continue;
      }
      const avg = (k: Dim) => sameDow.reduce((acc, x) => acc + (x[k] as number), 0) / sameDow.length;
      result.push({
        day: dayKey(d), ts: d.getTime(), count: 0,
        valence: avg('valence'), arousal: avg('arousal'), certainty: avg('certainty'),
        warmth: avg('warmth'), restlessness: avg('restlessness'),
      });
    }
    return result;
  }, [days]);

  // Most-recent (now) bucket
  const now = days[days.length - 1];

  // ── Resize observer ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Draw ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const start = performance.now();

    const draw = (t: number) => {
      const time = (t - start) / 1000;
      ctx.clearRect(0, 0, size.w, size.h);

      // Layout
      const padX = 24;
      const innerW = size.w - padX * 2;
      const nowH = 18;
      const pastH = 36;
      const forecastH = 14;
      const gap = 6;

      // ── NOW band — soft horizontal Rothko bleed ──
      const nowY = 0;
      const nowGrad = ctx.createLinearGradient(padX, nowY, padX + innerW, nowY);
      if (now) {
        DIMS.forEach((dim, i) => {
          const stop = i / (DIMS.length - 1);
          const v = now[dim];
          const [r, g, b] = TINT[dim];
          const alpha = 0.06 + v * 0.22 + Math.sin(time * 0.5 + i) * 0.015;
          nowGrad.addColorStop(stop, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        });
      } else {
        nowGrad.addColorStop(0, 'rgba(220, 219, 216, 0.04)');
        nowGrad.addColorStop(1, 'rgba(220, 219, 216, 0.04)');
      }
      ctx.fillStyle = nowGrad;
      ctx.fillRect(padX, nowY, innerW, nowH);

      // NOW label
      ctx.fillStyle = 'rgba(156, 154, 150, 0.32)';
      ctx.font = '9px var(--font-mono), monospace';
      ctx.textAlign = 'left';
      ctx.fillText('NOW', padX, nowY + 11);

      // ── PAST band ──
      const pastY = nowY + nowH + gap;
      const cellW = innerW / days.length;

      days.forEach((b, i) => {
        const x = padX + i * cellW;
        // Stack 5 dim-tinted slivers vertically inside the cell.
        const sliverH = pastH / DIMS.length;
        DIMS.forEach((dim, di) => {
          const v = b[dim];
          const [r, g, bl] = TINT[dim];
          const alpha = b.count === 0 ? 0.015 : 0.04 + v * 0.32;
          ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${alpha})`;
          ctx.fillRect(x, pastY + di * sliverH, cellW + 0.5, sliverH + 0.5);
        });

        // Hover highlight
        if (hoveredDay?.day === b.day) {
          ctx.strokeStyle = 'rgba(244, 243, 240, 0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, pastY + 0.5, cellW - 1, pastH - 1);
        }
      });

      // ── FORECAST band — dashed faint continuation ──
      const fcY = pastY + pastH + gap;
      ctx.setLineDash([2, 3]);
      forecast.forEach((b, i) => {
        const x = padX + innerW + i * (cellW * 0.5);
        DIMS.forEach((dim, di) => {
          const v = b[dim];
          const [r, g, bl] = TINT[dim];
          const sliverH = forecastH / DIMS.length;
          ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${0.018 + v * 0.08})`;
          ctx.fillRect(x, fcY + di * sliverH, cellW * 0.5, sliverH);
        });
      });
      ctx.setLineDash([]);

      // ── Time cursor ──
      if (timeCursor) {
        const t0 = days[0]?.ts ?? Date.now();
        const tN = days[days.length - 1]?.ts ?? Date.now();
        if (timeCursor >= t0 && timeCursor <= tN) {
          const frac = (timeCursor - t0) / (tN - t0 || 1);
          const cx = padX + frac * innerW;
          ctx.strokeStyle = 'rgba(201, 168, 124, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, pastY - 2);
          ctx.lineTo(cx, pastY + pastH + 2);
          ctx.stroke();
        }
      }

      // PAST label
      ctx.fillStyle = 'rgba(156, 154, 150, 0.32)';
      ctx.font = '9px var(--font-mono), monospace';
      ctx.fillText('PAST 30D', padX, pastY - 2);

      // FORECAST label
      ctx.fillText('FORECAST 48H', padX + innerW + 4, fcY - 2);

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [days, forecast, size, now, hoveredDay, timeCursor]);

  // ── Pointer interactions over the past band ──
  function dayAt(clientX: number, clientY: number): DayBucket | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const padX = 24;
    const innerW = rect.width - padX * 2;
    const nowH = 18;
    const gap = 6;
    const pastH = 36;
    const pastY = nowH + gap;
    if (y < pastY || y > pastY + pastH || x < padX || x > padX + innerW) return null;
    const idx = Math.floor(((x - padX) / innerW) * days.length);
    return days[Math.max(0, Math.min(days.length - 1, idx))] ?? null;
  }

  function dominantDimOf(b: DayBucket | null): Dim | null {
    if (!b || b.count === 0) return null;
    let best: Dim = 'valence'; let bestV = -Infinity;
    for (const d of DIMS) {
      const v = b[d];
      if (v > bestV) { bestV = v; best = d; }
    }
    return best;
  }

  function onPointerMove(e: React.PointerEvent) {
    const b = dayAt(e.clientX, e.clientY);
    setHoveredDay(b);
    const dom = dominantDimOf(b);
    // Translate climate dimension → constellation category for cross-layer wiring.
    const cat = dom === 'warmth' || dom === 'valence' ? 'values'
              : dom === 'restlessness' ? 'shadow'
              : dom === 'certainty' ? 'cognition'
              : null;
    setHoveredCategory(cat);
  }

  function onPointerLeave() {
    setHoveredDay(null);
    setHoveredCategory(null);
  }

  function onClick(e: React.MouseEvent) {
    const b = dayAt(e.clientX, e.clientY);
    if (!b) return;
    if (timeCursor && Math.abs(timeCursor - b.ts) < 86400_000 / 2) {
      setTimeCursor(null); // toggle off
    } else {
      setTimeCursor(b.ts);
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: 92,
        background: 'rgba(220, 219, 216, 0.012)',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        style={{ cursor: 'crosshair', display: 'block' }}
      />

      {/* Tooltip */}
      {hoveredDay && hoveredDay.count > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 4, right: 24,
            color: 'var(--text-soft)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.04em',
            pointerEvents: 'none',
          }}
        >
          {new Date(hoveredDay.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {' · '}
          {(() => {
            const d = dominantDimOf(hoveredDay);
            return d ? `${d} ${(hoveredDay[d] * 100).toFixed(0)}%` : '';
          })()}
          {' · '}
          {hoveredDay.count} reading{hoveredDay.count === 1 ? '' : 's'}
        </div>
      )}

      {timeCursor && (
        <button
          onClick={() => setTimeCursor(null)}
          style={{
            position: 'absolute', top: 4, left: 76,
            color: 'var(--luca)', fontFamily: 'var(--font-mono)', fontSize: 9,
            background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: '0.06em',
          }}
        >
          TIME-TRAVELING · {new Date(timeCursor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · clear
        </button>
      )}
    </div>
  );
}
