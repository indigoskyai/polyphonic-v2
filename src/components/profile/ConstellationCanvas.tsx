import { useEffect, useMemo, useRef, useState } from 'react';
import { buildConstellation, type Star } from './constellationModel';
import { useProfileLayoutStore } from './profileLayoutStore';

interface Props {
  profile: any;
  identityNarrative?: string | null;
}

/**
 * Canvas2D star-field. Slow ambient rotation, hover brightens, click opens evidence rail.
 * Uses palette tokens via getComputedStyle so the visual system stays in sync.
 */
export default function ConstellationCanvas({ profile, identityNarrative }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { selected, select, setHovered } = useProfileLayoutStore();

  const stars = useMemo(() => buildConstellation(profile), [profile]);

  // Resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = size.w / 2;
    const cy = size.h / 2;
    const baseR = Math.min(size.w, size.h) * 0.46;

    let t0 = performance.now();

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, size.w, size.h);

      // Soft radial fog
      const fog = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.3);
      fog.addColorStop(0, 'rgba(220, 219, 216, 0.025)');
      fog.addColorStop(0.6, 'rgba(220, 219, 216, 0.008)');
      fog.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, size.w, size.h);

      // Concentric orbital guides — extremely faint
      ctx.lineWidth = 1;
      for (const r of [0.24, 0.36, 0.48, 0.6, 0.72, 0.84]) {
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220, 219, 216, ${0.022 + Math.sin(t * 0.3 + r * 6) * 0.008})`;
        ctx.stroke();
      }

      // Identity core — a quiet glowing nucleus
      const coreR = baseR * 0.08;
      const corePulse = 1 + Math.sin(t * 0.6) * 0.05;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3 * corePulse);
      coreGrad.addColorStop(0, 'rgba(201, 168, 124, 0.32)');   // --luca
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

      // Stars — very slow rotation, slight breathing
      const rotation = t * 0.012;
      for (const s of stars) {
        const a = s.angle + rotation;
        const r = s.radius * baseR;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        const breathing = 1 + Math.sin(t * 0.7 + s.angle * 4) * 0.06;
        const isHover = hoverId === s.id;
        const isSelected = selected?.id === s.id;
        const focused = isHover || isSelected;

        const radius = (1.4 + s.mass * 3.2) * breathing * (focused ? 1.5 : 1);
        const alpha = (0.35 + s.glow * 0.55) * (focused ? 1.15 : 1);

        // Glow
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 6);
        const tint =
          s.category === 'shadow'
            ? `rgba(140, 168, 156, ${alpha * 0.18})` // --guardian
            : s.category === 'values' || s.category === 'big_five' || s.category === 'attachment'
            ? `rgba(201, 168, 124, ${alpha * 0.22})` // --luca
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

        // Selected/hover label
        if (focused) {
          ctx.font = '11px var(--font-mono), monospace';
          ctx.fillStyle = 'rgba(244, 243, 240, 0.78)';
          ctx.textAlign = 'left';
          ctx.fillText(s.label, x + radius + 8, y + 3);

          // Faint connection from core to focused star
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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [size, stars, hoverId, selected]);

  // Hit-testing — translate pointer to nearest star within tolerance
  function pickStar(clientX: number, clientY: number): Star | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const baseR = Math.min(rect.width, rect.height) * 0.46;
    const t = (performance.now() / 1000);
    const rotation = t * 0.012;

    let best: { star: Star; dist: number } | null = null;
    for (const s of stars) {
      const a = s.angle + rotation;
      const r = s.radius * baseR;
      const sx = cx + Math.cos(a) * r;
      const sy = cy + Math.sin(a) * r;
      const dx = x - sx;
      const dy = y - sy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const tolerance = 14 + s.mass * 8;
      if (d < tolerance && (!best || d < best.dist)) {
        best = { star: s, dist: d };
      }
    }
    return best?.star ?? null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = pickStar(e.clientX, e.clientY);
    setHoverId(s?.id ?? null);
    setHovered(s?.id ?? null);
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

      {/* Empty-state hint */}
      {stars.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none text-[11px]"
          style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}
        >
          no constellation yet — generate a profile first
        </div>
      )}

      {/* Identity narrative — quiet poetic line beneath the field */}
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

      {/* Top-left meta */}
      <div
        className="absolute top-4 left-5 text-[10px] uppercase pointer-events-none"
        style={{ color: 'var(--text-ghost)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}
      >
        the constellation · {stars.length} stars
      </div>
    </div>
  );
}
