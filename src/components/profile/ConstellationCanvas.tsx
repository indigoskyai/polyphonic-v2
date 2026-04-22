import { useEffect, useMemo, useRef, useState } from 'react';
import { buildConstellation, type Star } from './constellationModel';
import { useProfileLayoutStore } from './profileLayoutStore';

interface Props {
  profile: any;
  identityNarrative?: string | null;
}

/**
 * Canvas2D star-field. Slow ambient rotation, hover brightens, click opens evidence rail.
 *
 * Implementation notes (fixes from v1):
 * - Single setup effect: DPR + sizing applied once per resize, not per hover.
 * - Shared `tRef` keeps render time and pick-time rotation in lock-step.
 * - Star screen positions cached every frame (`positionsRef`); picking reads the
 *   exact same coordinates that were drawn — no drift.
 * - Hover/selected read via refs inside the RAF loop, so updates don't restart it.
 * - Hit-tolerance scales with viewport so big screens stay easy to click.
 */
export default function ConstellationCanvas({ profile, identityNarrative }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const tRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Cache of {id -> screen coords + visual radius} written by draw, read by pick.
  const positionsRef = useRef<Map<string, { x: number; y: number; r: number }>>(new Map());

  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  const { selected, select, setHovered } = useProfileLayoutStore();
  selectedRef.current = selected?.id ?? null;
  hoverRef.current = hoverId;

  const stars = useMemo(() => buildConstellation(profile), [profile]);
  const starsRef = useRef(stars);
  starsRef.current = stars;

  // ── One-time canvas + RAF setup. Re-runs only when stars set changes (new profile). ──
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const applySize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset + scale exactly once per resize
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(wrap);

    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      tRef.current = t;

      const { w, h } = sizeRef.current;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.46;

      ctx.clearRect(0, 0, w, h);

      // Soft radial fog
      const fog = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.3);
      fog.addColorStop(0, 'rgba(220, 219, 216, 0.025)');
      fog.addColorStop(0.6, 'rgba(220, 219, 216, 0.008)');
      fog.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, w, h);

      // Concentric orbital guides — extremely faint
      ctx.lineWidth = 1;
      for (const r of [0.24, 0.36, 0.48, 0.6, 0.72, 0.84]) {
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220, 219, 216, ${0.022 + Math.sin(t * 0.3 + r * 6) * 0.008})`;
        ctx.stroke();
      }

      // Identity core
      const coreR = baseR * 0.08;
      const corePulse = 1 + Math.sin(t * 0.6) * 0.05;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3 * corePulse);
      coreGrad.addColorStop(0, 'rgba(201, 168, 124, 0.32)');
      coreGrad.addColorStop(0.4, 'rgba(201, 168, 124, 0.10)');
      coreGrad.addColorStop(1, 'rgba(201, 168, 124, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 3 * corePulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(244, 243, 240, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Stars
      const rotation = t * 0.012;
      const positions = positionsRef.current;
      positions.clear();

      const currentStars = starsRef.current;
      const hover = hoverRef.current;
      const selectedId = selectedRef.current;

      for (const s of currentStars) {
        const a = s.angle + rotation;
        const r = s.radius * baseR;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        const breathing = 1 + Math.sin(t * 0.7 + s.angle * 4) * 0.06;
        const isHover = hover === s.id;
        const isSelected = selectedId === s.id;
        const focused = isHover || isSelected;

        const radius = (1.4 + s.mass * 3.2) * breathing * (focused ? 1.5 : 1);
        const alpha = (0.35 + s.glow * 0.55) * (focused ? 1.15 : 1);

        // Cache for picking — store the *visual* radius so tolerance follows star size
        positions.set(s.id, { x, y, r: radius });

        // Glow
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 6);
        const tint =
          s.category === 'shadow'
            ? `rgba(140, 168, 156, ${alpha * 0.18})`
            : s.category === 'values' || s.category === 'big_five' || s.category === 'attachment'
            ? `rgba(201, 168, 124, ${alpha * 0.22})`
            : `rgba(220, 219, 216, ${alpha * 0.18})`;
        g.addColorStop(0, tint);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius * 6, 0, Math.PI * 2);
        ctx.fill();

        // Star core
        ctx.fillStyle = `rgba(244, 243, 240, ${Math.min(1, alpha + 0.1)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Label + connection on focus
        if (focused) {
          ctx.font = '11px var(--font-mono), monospace';
          ctx.fillStyle = 'rgba(244, 243, 240, 0.78)';
          ctx.textAlign = 'left';
          ctx.fillText(s.label, x + radius + 8, y + 3);

          ctx.strokeStyle = 'rgba(201, 168, 124, 0.28)';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stars]);

  // ── Picking — reads cached positions written by the latest draw frame ──
  function pickStar(clientX: number, clientY: number): Star | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const positions = positionsRef.current;
    const baseR = Math.min(rect.width, rect.height) * 0.46;
    // Tolerance scales with viewport but never smaller than star's drawn radius.
    const baseTolerance = Math.max(10, baseR * 0.025);

    let best: { id: string; dist: number } | null = null;
    for (const s of starsRef.current) {
      const pos = positions.get(s.id);
      if (!pos) continue;
      const dx = x - pos.x;
      const dy = y - pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const tol = Math.max(baseTolerance, pos.r * 4);
      if (d < tol && (!best || d < best.dist)) {
        best = { id: s.id, dist: d };
      }
    }
    if (!best) return null;
    return starsRef.current.find((s) => s.id === best!.id) ?? null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = pickStar(e.clientX, e.clientY);
    const id = s?.id ?? null;
    if (id !== hoverRef.current) {
      setHoverId(id);
      setHovered(id);
    }
    if (canvasRef.current) {
      canvasRef.current.style.cursor = s ? 'pointer' : 'default';
    }
  }

  function onPointerLeave() {
    setHoverId(null);
    setHovered(null);
  }

  function onClick(e: React.MouseEvent) {
    const s = pickStar(e.clientX, e.clientY);
    if (s) select(s);
  }

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a0c 0%, #060608 70%, #060608 100%)' }}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />

      {stars.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none text-[11px]"
          style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}
        >
          no constellation yet — generate a profile first
        </div>
      )}

      {identityNarrative && (
        <div
          className="absolute inset-x-0 bottom-6 px-10 text-center pointer-events-none"
          style={{
            color: 'var(--text-soft)',
            fontStyle: 'italic',
            fontSize: 13,
            lineHeight: 1.7,
            letterSpacing: '0.01em',
            maxWidth: 720,
            margin: '0 auto',
            opacity: 0.78,
          }}
        >
          {identityNarrative}
        </div>
      )}

      <div
        className="absolute top-4 left-5 text-[10px] uppercase pointer-events-none"
        style={{ color: 'var(--text-ghost)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}
      >
        the constellation · {stars.length} stars
      </div>
    </div>
  );
}
