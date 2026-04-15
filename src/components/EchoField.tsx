import { useRef, useEffect, useCallback } from 'react';

interface EchoFieldProps {
  size?: number;
  particleCount?: number;
  state?: 'idle' | 'listening' | 'speaking' | 'thinking';
  className?: string;
  style?: React.CSSProperties;
}

export default function EchoField({
  size = 200,
  particleCount = 12000,
  state = 'idle',
  className,
  style,
}: EchoFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const animRef = useRef(0);

  useEffect(() => { stateRef.current = state; }, [state]);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const N = particleCount;

    let W: number, H: number, pw: number, ph: number;
    let imgData: ImageData, pix: Uint8ClampedArray;

    function resize() {
      const r = container!.getBoundingClientRect();
      W = r.width; H = r.height;
      pw = Math.round(W * dpr); ph = Math.round(H * dpr);
      canvas!.width = pw; canvas!.height = ph;
      imgData = ctx!.createImageData(pw, ph);
      pix = imgData.data;
    }
    resize();

    // ── Echo shape generator (3 concentric shells) ──
    function genEcho(): Float32Array {
      const arr = new Float32Array(3 * N);
      const radii = [0.38, 0.68, 0.98];
      const weights = [0.15, 0.30, 0.55];
      for (let i = 0; i < N; i++) {
        const r = Math.random();
        let shellIdx = 0, cum = 0;
        for (let s = 0; s < 3; s++) { cum += weights[s]; if (r < cum) { shellIdx = s; break; } }
        const rad = radii[shellIdx];
        const u = Math.random(), v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        arr[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
        arr[i * 3 + 1] = rad * Math.cos(phi);
        arr[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
      }
      return arr;
    }

    const homes = genEcho();

    // ── Particle state ──
    const SX = new Float32Array(N);
    const SY = new Float32Array(N);
    const VX = new Float32Array(N);
    const VY = new Float32Array(N);
    const PH = new Float32Array(N);
    const DLAYER = new Float32Array(N);
    const WM = new Float32Array(N);
    const EXC = new Float32Array(N);
    const PFREQ = new Float32Array(N);
    const THETA_S = new Float32Array(N);
    const PHI_S = new Float32Array(N);

    // Cymatic harmonic bands
    const BANDS = [
      { l: 2, m: 0, freq: 1.8, phase: 0.0, weight: 0.14 },
      { l: 3, m: 2, freq: 4.7, phase: 1.3, weight: 0.10 },
      { l: 4, m: 1, freq: 7.3, phase: 2.7, weight: 0.08 },
      { l: 5, m: 3, freq: 11.2, phase: 0.8, weight: 0.06 },
    ];
    const HARMONICS = BANDS.map(() => new Float32Array(N));

    for (let i = 0; i < N; i++) {
      THETA_S[i] = Math.atan2(homes[i * 3 + 2], homes[i * 3]);
      PHI_S[i] = Math.acos(Math.max(-1, Math.min(1, homes[i * 3 + 1])));
      PH[i] = Math.random() * Math.PI * 2;
      DLAYER[i] = Math.random();
      WM[i] = Math.random() * 0.4;
      EXC[i] = 0;
      PFREQ[i] = 0.8 + Math.random() * 0.4;
      SX[i] = W / 2;
      SY[i] = H / 2;
      for (let b = 0; b < BANDS.length; b++) {
        HARMONICS[b][i] = Math.sin(BANDS[b].l * PHI_S[i]) * Math.cos(BANDS[b].m * THETA_S[i]);
      }
    }

    let contagion = 0;
    let amp = 0, tAmp = 0;
    let lastFrameTime = 0;
    let time = 0;

    function render(ts: number) {
      const dt = Math.min(0.05, (ts - lastFrameTime) * 0.001);
      lastFrameTime = ts;
      time = ts;
      const elapsed = time * 0.001;
      const curState = stateRef.current;

      // Simulate audio amplitude
      const t = time * 0.003;
      if (curState === 'speaking') {
        const env = Math.max(0, Math.sin(t * 1.8) * 0.3 + Math.sin(t * 4.7) * 0.25 + Math.sin(t * 0.5) * 0.25);
        tAmp = Math.min(1, env * (Math.sin(t * 0.35) > 0.25 ? 1 : 0.1));
      } else if (curState === 'listening') {
        tAmp = Math.max(0, Math.sin(t * 2.3) * 0.12) * 0.5;
      } else {
        tAmp = 0;
      }
      amp += (tAmp - amp) * 0.08;

      pix.fill(0);

      const cx = W / 2, cy = H / 2;
      const baseSize = Math.min(W, H) * 0.32;

      // Rotation
      const rotY = elapsed * 0.12;
      const rotX = Math.sin(elapsed * 0.08) * 0.3;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Harmonic amplitudes
      const bandAmps = new Float32Array(BANDS.length);
      for (let b = 0; b < BANDS.length; b++) {
        const band = BANDS[b];
        const osc = Math.sin(elapsed * band.freq + band.phase);
        const baseline = 0.15;
        bandAmps[b] = osc * band.weight * baseline * (1 + amp * 3.5);
      }

      const breath = Math.sin(elapsed * 0.3) * 0.025;
      const baseExcRate = 0.0002 + amp * 0.004;

      for (let i = 0; i < N; i++) {
        let px = homes[i * 3], py = homes[i * 3 + 1], pz = homes[i * 3 + 2];

        // Cymatic displacement
        let cymaticD = breath;
        for (let b = 0; b < BANDS.length; b++) {
          cymaticD += HARMONICS[b][i] * bandAmps[b];
        }
        const radialScale = 1 + cymaticD;
        px *= radialScale; py *= radialScale; pz *= radialScale;

        // 3D rotation
        const x1 = px * cosY + pz * sinY;
        const z1 = -px * sinY + pz * cosY;
        const y1 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;

        const perspective = 3;
        const scale = perspective / (perspective + z2);
        const targetX = cx + x1 * scale * baseSize;
        const targetY = cy + y1 * scale * baseSize;

        const sp = 0.08;
        VX[i] += (targetX - SX[i]) * sp;
        VY[i] += (targetY - SY[i]) * sp;
        VX[i] *= 0.82; VY[i] *= 0.82;
        SX[i] += VX[i]; SY[i] += VY[i];

        // Excitation
        EXC[i] *= 0.985;
        if (Math.random() < baseExcRate) {
          EXC[i] = Math.max(EXC[i], 0.7 + Math.random() * 0.3);
          contagion = Math.min(1, contagion + 0.012);
        }

        const sxPx = Math.round(SX[i] * dpr);
        const syPx = Math.round(SY[i] * dpr);
        if (sxPx < 0 || sxPx >= pw || syPx < 0 || syPx >= ph) continue;

        const depthNorm = (z2 + 1.2) * 0.417;
        const depthClamp = Math.max(0, Math.min(1, depthNorm));
        const layerBright = 0.35 + DLAYER[i] * 0.55;

        let a = 0.04 + layerBright * 0.35 + depthClamp * 0.25;
        if (curState === 'idle') a *= 0.55;
        else if (curState === 'listening') a *= 0.72 + amp * 0.3;
        else if (curState === 'speaking') a *= 0.58 + amp * 0.6;
        else if (curState === 'thinking') a *= 0.70;

        a += EXC[i] * 0.55;
        a *= 0.88 + Math.sin(time * 0.0008 * PFREQ[i] + PH[i]) * 0.12;
        a = Math.min(1, Math.max(0, a));
        if (a < 0.015) continue;

        const wb = WM[i] * 0.4 + amp * 0.35 + EXC[i] * 0.5;
        let r = 172 + wb * 60 + depthClamp * 22;
        let g = 168 + wb * 28 + depthClamp * 18;
        let b = 162 - wb * 15 + depthClamp * 12;

        if (EXC[i] > 0.3) {
          const gb = (EXC[i] - 0.3) * 1.4;
          r = Math.min(255, r + gb * 30);
          g = Math.min(255, g + gb * 15);
          b = Math.max(0, b - gb * 20);
        }

        r = Math.min(255, Math.round(r));
        g = Math.min(255, Math.round(g));
        b = Math.min(255, Math.round(b));

        const idx = (syPx * pw + sxPx) * 4;
        const al = Math.round(a * 255);

        if (pix[idx + 3] > 0) {
          pix[idx] = Math.min(255, pix[idx] + Math.round(r * a * 0.55));
          pix[idx + 1] = Math.min(255, pix[idx + 1] + Math.round(g * a * 0.55));
          pix[idx + 2] = Math.min(255, pix[idx + 2] + Math.round(b * a * 0.55));
          pix[idx + 3] = Math.min(255, pix[idx + 3] + Math.round(al * 0.55));
        } else {
          pix[idx] = r; pix[idx + 1] = g; pix[idx + 2] = b; pix[idx + 3] = al;
        }

        // Bloom for bright/excited particles
        if ((depthClamp > 0.6 && a > 0.15) || EXC[i] > 0.4) {
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              if (ox === 0 && oy === 0) continue;
              const nx = sxPx + ox, ny = syPx + oy;
              if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) continue;
              const ni = (ny * pw + nx) * 4;
              const ba = a * 0.28 / (1 + Math.abs(ox) + Math.abs(oy));
              pix[ni] = Math.min(255, pix[ni] + Math.round(r * ba));
              pix[ni + 1] = Math.min(255, pix[ni + 1] + Math.round(g * ba));
              pix[ni + 2] = Math.min(255, pix[ni + 2] + Math.round(b * ba));
              pix[ni + 3] = Math.min(255, pix[ni + 3] + Math.round(ba * 255));
            }
          }
        }
      }

      contagion *= 0.93;
      ctx!.putImageData(imgData, 0, 0);
      animRef.current = requestAnimationFrame(render);
    }

    // Handle resize
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // Pause when tab not visible
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animRef.current);
      } else {
        lastFrameTime = performance.now();
        animRef.current = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [particleCount]);

  useEffect(() => {
    const cleanup = init();
    return cleanup;
  }, [init]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
