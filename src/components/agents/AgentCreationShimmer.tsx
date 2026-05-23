import { useEffect, useRef } from 'react';
import { useGenesisStore } from '@/stores/genesisStore';
import { generateShapePoints } from '@/lib/genesisShapes';

/**
 * AgentCreationShimmer — the agent-creation ceremony.
 *
 *   wash      warm-white particles emerge across the whole viewport (staggered
 *             arrival, skewed-faint brightness, varied twinkle — the landing
 *             field's organic feel), drifting gently
 *   swirl     they spiral inward toward the agent card's center and coalesce
 *             into the agent's signature shape
 *   hold      the shape rests at the card's center, slowly rotating, until the
 *             user dismisses (the card's "say hello")
 *
 * Transparent — the page stays visible; no backdrop dim. Fired by
 * genesisStore.celebrate() with the card rect + shape; calls markFormed() when
 * the shape settles so the card can reveal "say hello", and holds until
 * dismiss(). Reduced-motion: skips straight to formed.
 */

const WASH_END = 1700;
const CONVERGE_END = 3300;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export default function AgentCreationShimmer() {
  const active = useGenesisStore((s) => s.active);
  const runId = useGenesisStore((s) => s.runId);
  const args = useGenesisStore((s) => s.args);
  const markFormed = useGenesisStore((s) => s.markFormed);

  if (!active || !args) return null;
  return <CeremonyStage key={runId} args={args} markFormed={markFormed} />;
}

function CeremonyStage({
  args,
  markFormed,
}: {
  args: NonNullable<ReturnType<typeof useGenesisStore.getState>['args']>;
  markFormed: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const formedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const t = window.setTimeout(() => {
        if (!formedRef.current) {
          formedRef.current = true;
          markFormed();
        }
      }, 400);
      return () => window.clearTimeout(t);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(1.25, window.devicePixelRatio || 1);
    let W = window.innerWidth;
    let H = window.innerHeight;
    let pw = Math.round(W * dpr);
    let ph = Math.round(H * dpr);

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      pw = Math.max(1, Math.round(W * dpr));
      ph = Math.max(1, Math.round(H * dpr));
      canvas!.width = pw;
      canvas!.height = ph;
      canvas!.style.width = W + 'px';
      canvas!.style.height = H + 'px';
    }
    resize();
    let imgData = ctx.createImageData(pw, ph);
    let pix = imgData.data;
    const onResize = () => {
      resize();
      imgData = ctx.createImageData(pw, ph);
      pix = imgData.data;
    };
    window.addEventListener('resize', onResize);

    const REF_AREA = 1440 * 900;
    const N = Math.max(8000, Math.min(22000, Math.round((W * H) / REF_AREA * 17000)));
    const SHAPE = generateShapePoints(args.shapeIndex, N);

    const X = new Float32Array(N);
    const Y = new Float32Array(N);
    const VX = new Float32Array(N);
    const VY = new Float32Array(N);
    const PHs = new Float32Array(N);
    const TWF = new Float32Array(N);
    const TWA = new Float32Array(N);
    const LAYER = new Float32Array(N);
    const APPEAR = new Float32Array(N);

    const STAGGER = 950;
    for (let i = 0; i < N; i++) {
      X[i] = Math.random() * W;
      Y[i] = Math.random() * H;
      VX[i] = (Math.random() - 0.5) * 20;
      VY[i] = -3 - Math.random() * 24;
      PHs[i] = Math.random() * Math.PI * 2;
      TWF[i] = 0.3 + Math.random() * 2.0;
      TWA[i] = 0.3 + Math.random() * 0.7;
      LAYER[i] = Math.pow(Math.random(), 1.9);
      APPEAR[i] = Math.random() * STAGGER;
    }

    const tiltCos = Math.cos(-0.34);
    const tiltSin = Math.sin(-0.34);

    let raf = 0;
    let start = 0;
    let last = 0;
    // Live-tracked card center/size, seeded from the initial capture. Measuring
    // the celebrating card every frame (smoothed) lets the shape follow it as
    // the card compacts into its born layout — no jump, like the landing field.
    let liveCx = args.cardCx;
    let liveCy = args.cardCy;
    let liveSize = args.cardSize;

    function render(ts: number) {
      if (!start) {
        start = ts;
        last = ts;
      }
      const dt = Math.min(0.05, Math.max(0.006, (ts - last) * 0.001));
      last = ts;
      const t = ts - start;

      const cardEl = document.querySelector('.forge-card[data-celebrating="true"]');
      if (cardEl) {
        const r = cardEl.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) {
          const mAlpha = 1 - Math.exp(-7 * dt);
          liveCx += (r.left + r.width / 2 - liveCx) * mAlpha;
          liveCy += (r.top + r.height / 2 - liveCy) * mAlpha;
          liveSize += (Math.min(r.width, r.height) - liveSize) * mAlpha;
        }
      }
      const cardCx = liveCx;
      const cardCy = liveCy;
      const scale = liveSize * 0.18; // smaller — sits comfortably inside the card
      const rot = ts * 0.00016; // slow, dignified rotation (not gimmicky)

      const converging = t > WASH_END;
      const coalesceK = !converging ? 0 : easeInOut(clamp01((t - WASH_END) / (CONVERGE_END - WASH_END)));

      // Soft ignition bloom as the shape completes.
      let ignite = 0;
      if (t > CONVERGE_END - 350 && t < CONVERGE_END + 350) {
        ignite = Math.sin(clamp01((t - (CONVERGE_END - 350)) / 700) * Math.PI);
      }

      if (!formedRef.current && t >= CONVERGE_END) {
        formedRef.current = true;
        markFormed();
      }

      pix.fill(0);

      for (let i = 0; i < N; i++) {
        const appear = clamp01((t - APPEAR[i]) / 460);
        if (appear <= 0) continue;

        // Project this particle's shape point at the current rotation.
        const x = SHAPE[i * 3];
        const y = SHAPE[i * 3 + 1];
        const z = SHAPE[i * 3 + 2];
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const rx = x * cosR + z * sinR;
        const rz = -x * sinR + z * cosR;
        const ty3 = y * tiltCos - rz * tiltSin;
        const tz3 = y * tiltSin + rz * tiltCos;
        const persp = 2.5 / (3.0 - tz3);
        const shapeX = cardCx + rx * scale * persp;
        const shapeY = cardCy + ty3 * scale * persp;

        let depth = 0;
        if (coalesceK <= 0) {
          // Wash drift.
          X[i] += VX[i] * dt;
          Y[i] += VY[i] * dt;
        } else {
          // Swirl inward — tangential spin (decays as they arrive) + converge.
          const dxc = X[i] - cardCx;
          const dyc = Y[i] - cardCy;
          const swirl = (1 - coalesceK) * 2.4;
          X[i] += -dyc * swirl * dt;
          Y[i] += dxc * swirl * dt;
          const rate = (3 + LAYER[i] * 6) * (0.5 + coalesceK);
          const alpha = 1 - Math.exp(-rate * dt);
          X[i] += (shapeX - X[i]) * alpha;
          Y[i] += (shapeY - Y[i]) * alpha;
          depth = clamp01((persp - 0.55) / 0.85) * coalesceK;
        }

        const sxPx = (X[i] * dpr) | 0;
        const syPx = (Y[i] * dpr) | 0;
        if (sxPx < 0 || sxPx >= pw || syPx < 0 || syPx >= ph) continue;

        const tw = Math.max(0, 1 - TWA[i] + Math.sin(ts * 0.005 * TWF[i] + PHs[i]) * TWA[i]);
        let a = (0.10 + LAYER[i] * 0.62 + depth * 0.22) * appear * tw;
        a += ignite * (0.3 + LAYER[i] * 0.35);
        if (a < 0.012) continue;
        if (a > 1) a = 1;

        const warm = ignite * 0.45;
        const r = 182 + warm * 48;
        const g = 178 + warm * 22;
        const b = 170 - warm * 8;

        const pi = (syPx * pw + sxPx) * 4;
        const al = (a * 255) | 0;
        if (pix[pi + 3] > 0) {
          pix[pi] = Math.min(255, pix[pi] + ((r * a * 0.7) | 0));
          pix[pi + 1] = Math.min(255, pix[pi + 1] + ((g * a * 0.7) | 0));
          pix[pi + 2] = Math.min(255, pix[pi + 2] + ((b * a * 0.7) | 0));
          pix[pi + 3] = Math.min(255, pix[pi + 3] + ((al * 0.7) | 0));
        } else {
          pix[pi] = r;
          pix[pi + 1] = g;
          pix[pi + 2] = b;
          pix[pi + 3] = al;
        }

        if (a > 0.34 && (LAYER[i] > 0.8 || ignite > 0.2)) {
          const bs = a * 0.42;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              if (ox === 0 && oy === 0) continue;
              const nx = sxPx + ox;
              const ny = syPx + oy;
              if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) continue;
              const ni = (ny * pw + nx) * 4;
              const fall = 1 / (1 + Math.abs(ox) + Math.abs(oy));
              const ba = bs * fall;
              pix[ni] = Math.min(255, pix[ni] + ((r * ba) | 0));
              pix[ni + 1] = Math.min(255, pix[ni + 1] + ((g * ba) | 0));
              pix[ni + 2] = Math.min(255, pix[ni + 2] + ((b * ba) | 0));
              pix[ni + 3] = Math.min(255, pix[ni + 3] + ((ba * 255) | 0));
            }
          }
        }
      }

      ctx!.putImageData(imgData, 0, 0);
      raf = requestAnimationFrame(render); // holds at the formed shape until dismiss
    }
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9000,
      }}
    />
  );
}
