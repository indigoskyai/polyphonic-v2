import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * LandingParticleField — the living mark for the public landing.
 *
 * One persistent particle entity. Four states:
 *
 *   idle       — chaotic, fluid drift across the whole viewport. No
 *                card exclusion. Slower smoothing, larger noise.
 *
 *   composer   — the user has focused the composer. Particles organize
 *                into a soft cloud whose center sits behind the card,
 *                with the card's exact rectangle carved out as an
 *                exclusion zone. Density piles up at the card edge,
 *                producing a halo conformed to the card's actual
 *                shape (not bigger, not smaller).
 *
 *   auth       — same model with the auth card's larger rectangle.
 *
 *   dissipate  — exit. Canvas opacity ramps to 0 while particles drift
 *                outward.
 */

const BASE_N = 40000;
const REFERENCE_AREA = 1440 * 900;

function computeN(): number {
  if (typeof window === "undefined") return BASE_N;
  const area = window.innerWidth * window.innerHeight;
  const scale = Math.min(1.15, Math.max(0.45, area / REFERENCE_AREA));
  return Math.round(BASE_N * scale);
}

const MAX_RIPPLES = 6;

export type LandingFieldState = "idle" | "composer" | "auth" | "dissipate";

interface ShapeProfile {
  /** When true, the particle field carves an exclusion rectangle
   *  matching the cardRef element's actual bounding box (measured
   *  every frame). When false, no card carve — pure cloud. */
  useCard: boolean;
  /** Outward inset (px) added to the card's bounding rect when carving
   *  the exclusion zone. Avoids particles getting visually swallowed by
   *  the card's box-shadow. */
  cardOutsetPx: number;
  /** Cloud spread — gaussian sigma. Capped against viewport at runtime. */
  cloudSigmaX: number;
  cloudSigmaY: number;
  /** Per-particle smoothing rate (lower = lazier). Lower in idle so
   *  particles can flow with the curl field instead of snapping back. */
  smoothMin: number;
  smoothMax: number;
  /** Per-particle micro-jitter amplitude (px/s). */
  noiseAmp: number;
  /** Curl-noise FIELD flow speed (px/s). Adjacent particles flow in
   *  similar directions, giving fluid-like body motion. Strong in idle,
   *  gentle in composer/auth. */
  flowAmp: number;
  /** When true, the cursor repels nearby particles (idle behavior).
   *  When false, the cursor attracts (focus-drift brightness boost). */
  cursorRepels: boolean;
  /** Auto-spawn echo ripples every this-many-ms (jittered ±50%).
   *  Set to 0 to disable. */
  echoIntervalMs: number;
  /** Overall brightness scalar. */
  brightness: number;
  /** Canvas opacity target. */
  opacity: number;
  /** Outward drift velocity. Non-zero only in dissipate. */
  outwardDrift: number;
}

const PROFILES: Record<LandingFieldState, ShapeProfile> = {
  idle: {
    useCard: false,
    cardOutsetPx: 0,
    cloudSigmaX: 720,
    cloudSigmaY: 540,
    // Very lazy smoothing — particles drift with the curl flow rather
    // than snap back to their gaussian home.
    smoothMin: 0.4,
    smoothMax: 1.2,
    noiseAmp: 1.6,
    flowAmp: 78,
    cursorRepels: true,
    echoIntervalMs: 9000,
    brightness: 0.98,
    opacity: 1.0,
    outwardDrift: 0,
  },
  composer: {
    useCard: true,
    cardOutsetPx: 4,
    cloudSigmaX: 520,
    cloudSigmaY: 360,
    smoothMin: 2.5,
    smoothMax: 6.0,
    noiseAmp: 1.2,
    flowAmp: 14,
    cursorRepels: false,
    echoIntervalMs: 0,
    brightness: 1.15,
    opacity: 1.0,
    outwardDrift: 0,
  },
  auth: {
    useCard: true,
    cardOutsetPx: 4,
    cloudSigmaX: 480,
    cloudSigmaY: 460,
    smoothMin: 2.5,
    smoothMax: 6.0,
    noiseAmp: 1.2,
    flowAmp: 14,
    cursorRepels: false,
    echoIntervalMs: 0,
    brightness: 1.05,
    opacity: 1.0,
    outwardDrift: 0,
  },
  dissipate: {
    useCard: false,
    cardOutsetPx: 0,
    cloudSigmaX: 720,
    cloudSigmaY: 540,
    smoothMin: 0.5,
    smoothMax: 1.5,
    noiseAmp: 2.5,
    flowAmp: 0,
    cursorRepels: false,
    echoIntervalMs: 0,
    brightness: 1.0,
    opacity: 0,
    outwardDrift: 80,
  },
};

export interface LandingFieldHandle {
  /** Emit an excitement ripple at the given page coordinates (defaults to center). */
  ripple: (x?: number, y?: number) => void;
}

interface LandingFieldProps {
  state: LandingFieldState;
  /** Optional ref to the card element. When the active state has
   *  useCard=true and this ref points to a mounted element, the
   *  particle field carves an exclusion zone matching the element's
   *  current bounding box, measured every frame. */
  cardRef?: React.RefObject<HTMLElement>;
}

// ──────────────────────────────────────────────────────────────────────
// Deterministic random.
// ──────────────────────────────────────────────────────────────────────

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function gaussFrom(i: number, saltA: number, saltB: number): number {
  const u = Math.max(1e-6, 1 - hash(i, saltA));
  const v = hash(i, saltB);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const LandingParticleField = forwardRef<LandingFieldHandle, LandingFieldProps>(
  function LandingParticleField({ state, cardRef }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const stateRef = useRef<LandingFieldState>(state);
    const cardRefRef = useRef<typeof cardRef>(cardRef);
    const rippleQueue = useRef<Array<{ x: number; y: number }>>([]);

    useEffect(() => {
      stateRef.current = state;
    }, [state]);
    useEffect(() => {
      cardRefRef.current = cardRef;
    }, [cardRef]);

    useImperativeHandle(
      ref,
      () => ({
        ripple(x?: number, y?: number) {
          const px = typeof x === "number" ? x : window.innerWidth / 2;
          const py = typeof y === "number" ? y : window.innerHeight / 2;
          rippleQueue.current.push({ x: px, y: py });
        },
      }),
      []
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      const N = computeN();
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);

      let W = 0,
        H = 0,
        pw = 0,
        ph = 0;
      let imgData: ImageData = ctx.createImageData(1, 1);
      let pix = imgData.data;

      function resize() {
        W = window.innerWidth;
        H = window.innerHeight;
        pw = Math.max(1, Math.round(W * dpr));
        ph = Math.max(1, Math.round(H * dpr));
        canvas!.width = pw;
        canvas!.height = ph;
        canvas!.style.width = W + "px";
        canvas!.style.height = H + "px";
        imgData = ctx!.createImageData(pw, ph);
        pix = imgData.data;
      }
      resize();

      // Particle state.
      const SX = new Float32Array(N);
      const SY = new Float32Array(N);
      const EVX = new Float32Array(N);
      const EVY = new Float32Array(N);
      const PH = new Float32Array(N);
      const DLAYER = new Float32Array(N);
      const WM = new Float32Array(N);
      const EXC = new Float32Array(N);
      const PFREQ = new Float32Array(N);

      // Per-particle stable home offsets (gaussian σ=1 each axis) and
      // brightness/rate weights. Stable across state morphs so when the
      // card geometry changes, particles smoothly slide outward to wrap
      // the new shape rather than re-shuffling positions.
      const HOME_DX = new Float32Array(N);
      const HOME_DY = new Float32Array(N);
      const HOME_BRIGHT = new Float32Array(N);
      const RATE_WEIGHT = new Float32Array(N);

      for (let i = 0; i < N; i++) {
        const cx = W / 2;
        const cy = H / 2;
        SX[i] = cx + gaussFrom(i, 2.3, 4.1) * 200;
        SY[i] = cy + gaussFrom(i, 5.7, 3.3) * 200;
        EVX[i] = 0;
        EVY[i] = 0;
        PH[i] = hash(i, 0.09) * Math.PI * 2;
        DLAYER[i] = hash(i, 0.27);
        WM[i] = hash(i, 0.55) * 0.4;
        EXC[i] = 0;
        PFREQ[i] = 0.75 + hash(i, 0.71) * 0.45;

        HOME_DX[i] = gaussFrom(i, 1.21, 1.47);
        HOME_DY[i] = gaussFrom(i, 1.31, 1.61);
        HOME_BRIGHT[i] = 0.55 + hash(i, 1.93) * 0.55;
        RATE_WEIGHT[i] = hash(i, 0.33);
      }

      // Cursor → focus drift.
      let focusX = 0;
      let focusY = 0;
      let focusVX = 0;
      let focusVY = 0;
      let cursorX = -9999;
      let cursorY = -9999;
      let cursorPresent = false;
      const onPointer = (e: PointerEvent) => {
        cursorX = e.clientX;
        cursorY = e.clientY;
        cursorPresent = true;
      };
      const onPointerLeave = () => {
        cursorPresent = false;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
      window.addEventListener("blur", onPointerLeave);

      // Ripples.
      const RIPPLES = new Float32Array(MAX_RIPPLES * 5);
      let activeRipples = 0;
      function addRipple(x: number, y: number) {
        let slot = activeRipples;
        if (activeRipples >= MAX_RIPPLES) {
          let oldestIdx = 0,
            oldestAge = -1;
          for (let i = 0; i < MAX_RIPPLES; i++) {
            if (RIPPLES[i * 5 + 2] > oldestAge) {
              oldestAge = RIPPLES[i * 5 + 2];
              oldestIdx = i;
            }
          }
          slot = oldestIdx;
        } else {
          activeRipples++;
        }
        const o = slot * 5;
        RIPPLES[o] = x;
        RIPPLES[o + 1] = y;
        RIPPLES[o + 2] = 0;
        RIPPLES[o + 3] = 1.4;
        RIPPLES[o + 4] = 320;
      }
      function updateRipples(dt: number) {
        for (let i = activeRipples - 1; i >= 0; i--) {
          const o = i * 5;
          RIPPLES[o + 2] += dt;
          if (RIPPLES[o + 2] > RIPPLES[o + 3]) {
            if (i < activeRipples - 1) {
              const lo = (activeRipples - 1) * 5;
              for (let j = 0; j < 5; j++) RIPPLES[o + j] = RIPPLES[lo + j];
            }
            activeRipples--;
          }
        }
      }

      let contagion = 0;

      const onResize = () => resize();
      window.addEventListener("resize", onResize);

      let paused = document.hidden;
      const onVisibility = () => {
        const wasPaused = paused;
        paused = document.hidden;
        if (wasPaused && !paused) {
          lastFrameTime = performance.now();
          if (!animRef.current) {
            animRef.current = requestAnimationFrame(render);
          }
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      if (reduced) {
        return () => {
          window.removeEventListener("resize", onResize);
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("pointermove", onPointer);
          window.removeEventListener("pointerleave", onPointerLeave);
          window.removeEventListener("blur", onPointerLeave);
        };
      }

      let lastFrameTime = performance.now();

      // dt-smoothed live profile values. Card half-extents are measured
      // each frame from the cardRef element when the active state has
      // useCard=true; otherwise they collapse toward 0.
      let canvasOpacity = PROFILES[stateRef.current].opacity;
      let liveCardHW = 0;
      let liveCardHH = 0;
      let liveCardCX = 0;
      let liveCardCY = 0;
      let liveSigmaX = PROFILES[stateRef.current].cloudSigmaX;
      let liveSigmaY = PROFILES[stateRef.current].cloudSigmaY;
      let liveNoise = PROFILES[stateRef.current].noiseAmp;
      let liveFlow = PROFILES[stateRef.current].flowAmp;
      let liveBright = PROFILES[stateRef.current].brightness;
      let liveSmoothMin = PROFILES[stateRef.current].smoothMin;
      let liveSmoothMax = PROFILES[stateRef.current].smoothMax;
      let liveOutward = PROFILES[stateRef.current].outwardDrift;

      // Transition tracking — focus-bloom fires on idle→composer.
      let prevState: LandingFieldState = stateRef.current;
      // Echo wave timer — auto-spawns ripples in idle.
      let nextEchoAt = performance.now() + 3000; // first echo a bit early

      function render(ts: number) {
        const rawDt = (ts - lastFrameTime) * 0.001;
        const dt = Math.min(0.05, Math.max(0.006, rawDt));
        lastFrameTime = ts;
        const time = ts;

        while (rippleQueue.current.length > 0) {
          const r = rippleQueue.current.shift()!;
          addRipple(r.x, r.y);
        }

        // Cursor → focus drift.
        if (cursorPresent) {
          const targetFX = cursorX / W - 0.5;
          const targetFY = cursorY / H - 0.5;
          const fAlpha = 1 - Math.exp(-3.5 * dt);
          focusX += (targetFX - focusX) * fAlpha;
          focusY += (targetFY - focusY) * fAlpha;
          focusVX *= Math.exp(-2 * dt);
          focusVY *= Math.exp(-2 * dt);
        } else {
          const sc = dt * 60;
          focusVX += (Math.random() - 0.5) * 0.003 * sc;
          focusVY += (Math.random() - 0.5) * 0.003 * sc;
          const damp = Math.exp(-0.9 * dt);
          focusVX *= damp;
          focusVY *= damp;
          focusX += focusVX;
          focusY += focusVY;
          const d2 = focusX * focusX + focusY * focusY;
          if (d2 > 0.64) {
            const s = Math.exp(-1.8 * dt);
            focusX *= s;
            focusY *= s;
          }
        }

        updateRipples(dt);

        // Smooth profile params toward target state.
        const profile = PROFILES[stateRef.current];
        const profileAlpha = 1 - Math.exp(-1.6 * dt);

        // Measure the card's actual rectangle when state.useCard is on.
        // Falls back to 0 (no card) when off or ref isn't mounted.
        let targetCardHW = 0;
        let targetCardHH = 0;
        let targetCardCX = W / 2;
        let targetCardCY = H / 2;
        if (profile.useCard) {
          const el = cardRefRef.current?.current;
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 1 && r.height > 1) {
              targetCardHW = r.width / 2;
              targetCardHH = r.height / 2;
              targetCardCX = r.left + r.width / 2;
              targetCardCY = r.top + r.height / 2;
            }
          }
        }
        liveCardHW += (targetCardHW - liveCardHW) * profileAlpha;
        liveCardHH += (targetCardHH - liveCardHH) * profileAlpha;
        liveCardCX += (targetCardCX - liveCardCX) * profileAlpha;
        liveCardCY += (targetCardCY - liveCardCY) * profileAlpha;

        liveSigmaX += (profile.cloudSigmaX - liveSigmaX) * profileAlpha;
        liveSigmaY += (profile.cloudSigmaY - liveSigmaY) * profileAlpha;
        liveNoise += (profile.noiseAmp - liveNoise) * profileAlpha;
        liveFlow += (profile.flowAmp - liveFlow) * profileAlpha;
        liveBright += (profile.brightness - liveBright) * profileAlpha;
        liveSmoothMin += (profile.smoothMin - liveSmoothMin) * profileAlpha;
        liveSmoothMax += (profile.smoothMax - liveSmoothMax) * profileAlpha;
        liveOutward += (profile.outwardDrift - liveOutward) * profileAlpha;

        // Detect state transition. Focus-bloom: idle → composer fires
        // a contagion burst that spreads visible excitement through the
        // field over the next ~600ms (existing decay rate).
        if (prevState !== stateRef.current) {
          if (prevState === "idle" && stateRef.current === "composer") {
            contagion = Math.max(contagion, 0.95);
            // Seed a handful of fully-excited particles so the bloom
            // has obvious sources, not just gradual lift.
            for (let k = 0; k < 240; k++) {
              const idx = (Math.random() * N) | 0;
              EXC[idx] = 0.7 + Math.random() * 0.3;
            }
          }
          prevState = stateRef.current;
        }

        // Echo waves — periodic ripples in idle. Disabled in other
        // states (where ripples are explicit, e.g. on send).
        if (profile.echoIntervalMs > 0 && time > nextEchoAt) {
          // Bias slightly toward viewport center so echoes feel
          // contextual rather than perfectly random.
          const rx = W * (0.18 + Math.random() * 0.64);
          const ry = H * (0.18 + Math.random() * 0.64);
          addRipple(rx, ry);
          const jitter = profile.echoIntervalMs * 0.5;
          nextEchoAt =
            time + profile.echoIntervalMs + (Math.random() - 0.5) * jitter * 2;
        } else if (profile.echoIntervalMs === 0) {
          // Reset the timer so echoes resume promptly when state goes
          // back to idle.
          nextEchoAt = time + 4000;
        }

        const opRate = profile.opacity < 0.01 ? 0.9 : 4.5;
        canvasOpacity += (profile.opacity - canvasOpacity) * (1 - Math.exp(-opRate * dt));
        canvas!.style.opacity = String(canvasOpacity);
        const renderVisible = canvasOpacity > 0.015;

        if (renderVisible) pix.fill(0);
        else ctx!.clearRect(0, 0, pw, ph);

        const cx = W / 2;
        const cy = H / 2;
        const sigmaX = Math.min(liveSigmaX, W * 0.55);
        const sigmaY = Math.min(liveSigmaY, H * 0.55);

        // Card exclusion rectangle — uses the live (smoothed) measurement
        // of the actual card element, plus the active profile's outward
        // inset so particles aren't visually swallowed by box-shadow.
        const outset = profile.cardOutsetPx;
        const cardLeft = liveCardCX - liveCardHW - outset;
        const cardRight = liveCardCX + liveCardHW + outset;
        const cardTop = liveCardCY - liveCardHH - outset;
        const cardBottom = liveCardCY + liveCardHH + outset;
        const haveCard = liveCardHW > 1 && liveCardHH > 1;

        // Curl-noise flow constants. Spatial frequencies are tuned for
        // ~250-400px wavelengths so the flow has visible structure
        // without becoming chaotic. Time evolves slowly so the field
        // morphs gradually rather than jittering.
        const k1x = 0.0036,
          k1y = 0.0029;
        const k2x = 0.0078,
          k2y = 0.0066;
        const tA = time * 0.00038;
        const tB = time * 0.00061;

        // Cursor → repulsion (idle) or attraction (composer/auth).
        const cursorRepelRadius = 220;
        const cursorRepelRadius2 = cursorRepelRadius * cursorRepelRadius;
        const repelStrength = profile.cursorRepels && cursorPresent ? 220 : 0;

        const baseExcRate = 0.0001;
        const breath = 0.92 + Math.sin(time * 0.0004) * 0.03;
        const tNoise = time * 0.00035;

        const velRate = 3.0;
        const alphaV = 1 - Math.exp(-velRate * dt);

        const vw = W,
          vh = H;

        for (let i = 0; i < N; i++) {
          // Soft-cloud target — pure gaussian.
          let tx = cx + HOME_DX[i] * sigmaX;
          let ty = cy + HOME_DY[i] * sigmaY;

          // If the home falls inside the card rectangle, push it to the
          // nearest edge along whichever axis has smaller penetration.
          // This produces a halo whose outline matches the rectangle.
          if (haveCard && tx > cardLeft && tx < cardRight && ty > cardTop && ty < cardBottom) {
            const penLeft = tx - cardLeft;
            const penRight = cardRight - tx;
            const penTop = ty - cardTop;
            const penBottom = cardBottom - ty;
            const minPen = Math.min(penLeft, penRight, penTop, penBottom);
            if (minPen === penTop) ty = cardTop;
            else if (minPen === penBottom) ty = cardBottom;
            else if (minPen === penLeft) tx = cardLeft;
            else tx = cardRight;
          }

          const bright = HOME_BRIGHT[i] * liveBright;

          // Position smoothing — per-particle rate.
          const rate = liveSmoothMin + RATE_WEIGHT[i] * (liveSmoothMax - liveSmoothMin);
          const alpha = 1 - Math.exp(-rate * dt);
          SX[i] += (tx - SX[i]) * alpha;
          SY[i] += (ty - SY[i]) * alpha;

          if (liveOutward > 0.5) {
            const dxOut = SX[i] - cx;
            const dyOut = SY[i] - cy;
            const d = Math.sqrt(dxOut * dxOut + dyOut * dyOut) + 0.001;
            EVX[i] = (dxOut / d) * liveOutward;
            EVY[i] = (dyOut / d) * liveOutward;
          } else {
            EVX[i] += (0 - EVX[i]) * alphaV;
            EVY[i] += (0 - EVY[i]) * alphaV;
          }
          SX[i] += EVX[i] * dt;
          SY[i] += EVY[i] * dt;

          // ─ Curl-noise field flow ───────────────────────────────
          // Two-octave sinusoidal scalar potential; flow is the curl
          // (perpendicular gradient) so the field is divergence-free,
          // i.e. fluid-like rather than radial. Adjacent particles get
          // similar flow vectors → the body moves as a connected body.
          const fx1 = SX[i] * k1x;
          const fy1 = SY[i] * k1y;
          const fx2 = SX[i] * k2x;
          const fy2 = SY[i] * k2y;
          const flowX =
            Math.cos(fx1 + tA) * Math.sin(fy1 + tA * 0.7) +
            0.55 * Math.sin(fx2 + tB) * Math.cos(fy2 + tB * 0.6);
          const flowY =
            -Math.sin(fx1 + tA) * Math.cos(fy1 + tA * 0.7) -
            0.55 * Math.cos(fx2 + tB) * Math.sin(fy2 + tB * 0.6);
          SX[i] += flowX * liveFlow * dt;
          SY[i] += flowY * liveFlow * dt;

          // ─ Per-particle micro-jitter ──────────────────────────
          // Smaller than the flow but de-correlated per particle so
          // they don't move in perfect lockstep with the field.
          const nx =
            Math.sin(SX[i] * 0.0062 + tNoise + PH[i]) *
            Math.cos(SY[i] * 0.0041 + tNoise * 0.7);
          const ny =
            Math.cos(SX[i] * 0.0051 + tNoise * 0.6 + PH[i] * 1.3) *
            Math.sin(SY[i] * 0.0073 + tNoise * 1.1);
          SX[i] += nx * liveNoise * dt;
          SY[i] += ny * liveNoise * dt;

          // ─ Cursor repulsion (idle only) ───────────────────────
          // Particles within cursorRepelRadius push outward from the
          // cursor with strength falling off linearly to the radius.
          if (repelStrength > 0) {
            const rdx = SX[i] - cursorX;
            const rdy = SY[i] - cursorY;
            const rd2 = rdx * rdx + rdy * rdy;
            if (rd2 < cursorRepelRadius2 && rd2 > 1) {
              const rd = Math.sqrt(rd2);
              const falloff = 1 - rd / cursorRepelRadius;
              const push = repelStrength * falloff * dt;
              SX[i] += (rdx / rd) * push;
              SY[i] += (rdy / rd) * push;
            }
          }

          if (!renderVisible) continue;

          const nxp = SX[i] / vw - 0.5;
          const nyp = SY[i] / vh - 0.5;
          const fdx = nxp - focusX;
          const fdy = nyp - focusY;
          const focusD2 = fdx * fdx + fdy * fdy;
          let focusBoost = 0;
          if (focusD2 < 0.06) {
            focusBoost = (1 - focusD2 / 0.06) * 0.28;
          }

          let rippleExciteChance = 0;
          for (let r = 0; r < activeRipples; r++) {
            const o = r * 5;
            const rdx = SX[i] - RIPPLES[o];
            if (rdx > 360 || rdx < -360) continue;
            const rdy = SY[i] - RIPPLES[o + 1];
            if (rdy > 360 || rdy < -360) continue;
            const rd = Math.sqrt(rdx * rdx + rdy * rdy);
            const rAge = RIPPLES[o + 2];
            const rMaxAge = RIPPLES[o + 3];
            const rMaxR = RIPPLES[o + 4];
            const curRadius = (rAge / rMaxAge) * rMaxR;
            const distFromFront = Math.abs(rd - curRadius);
            if (distFromFront < 36) {
              const ageRatio = 1 - rAge / rMaxAge;
              const frontStrength = 1 - distFromFront / 36;
              rippleExciteChance += ageRatio * frontStrength * 0.05;
            }
          }

          EXC[i] *= Math.exp(-1.0 * dt);
          const excProb =
            (baseExcRate + contagion * 0.0018 + rippleExciteChance) * dt * 60;
          if (Math.random() < excProb) {
            EXC[i] = Math.max(EXC[i], 0.7 + Math.random() * 0.3);
            contagion = Math.min(1, contagion + 0.01);
          }

          const sxPx = Math.round(SX[i] * dpr);
          const syPx = Math.round(SY[i] * dpr);
          if (sxPx < 0 || sxPx >= pw || syPx < 0 || syPx >= ph) continue;

          const layerBright = 0.32 + DLAYER[i] * 0.55;
          let a = 0.04 + layerBright * 0.28;
          a *= 0.72;
          a += EXC[i] * 0.5;
          a += focusBoost;
          a *= 0.9 + Math.sin(time * 0.0007 * PFREQ[i] + PH[i]) * 0.1;
          a *= bright;
          a *= breath;

          a = Math.min(1, Math.max(0, a));
          if (a < 0.015) continue;

          const exciteWarm = EXC[i] * 0.5;
          const focusWarm = focusBoost * 0.8;
          const wb = WM[i] * 0.4 + exciteWarm + focusWarm;

          let r = 172 + wb * 60;
          let g = 168 + wb * 28;
          let b = 162 - wb * 15;

          if (EXC[i] > 0.3) {
            const gb = (EXC[i] - 0.3) * 1.4;
            r = Math.min(255, r + gb * 30);
            g = Math.min(255, g + gb * 15);
            b = Math.max(0, b - gb * 20);
          }

          r = Math.min(255, Math.round(r));
          g = Math.min(255, Math.round(g));
          b = Math.min(255, Math.round(b));

          const pi = (syPx * pw + sxPx) * 4;
          const al = Math.round(a * 255);

          if (pix[pi + 3] > 0) {
            pix[pi] = Math.min(255, pix[pi] + Math.round(r * a * 0.55));
            pix[pi + 1] = Math.min(255, pix[pi + 1] + Math.round(g * a * 0.55));
            pix[pi + 2] = Math.min(255, pix[pi + 2] + Math.round(b * a * 0.55));
            pix[pi + 3] = Math.min(255, pix[pi + 3] + Math.round(al * 0.55));
          } else {
            pix[pi] = r;
            pix[pi + 1] = g;
            pix[pi + 2] = b;
            pix[pi + 3] = al;
          }

          const shouldBloom =
            EXC[i] > 0.4 || focusBoost > 0.14 || (a > 0.28 && DLAYER[i] > 0.78);
          if (shouldBloom) {
            const bloomStr = EXC[i] > 0.4 ? 0.45 : 0.28;
            for (let oy = -1; oy <= 1; oy++) {
              for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;
                const nx = sxPx + ox;
                const ny = syPx + oy;
                if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) continue;
                const ni = (ny * pw + nx) * 4;
                const dist = Math.abs(ox) + Math.abs(oy);
                const falloff = 1 / (1 + dist);
                const ba = a * bloomStr * falloff;
                pix[ni] = Math.min(255, pix[ni] + Math.round(r * ba));
                pix[ni + 1] = Math.min(255, pix[ni + 1] + Math.round(g * ba));
                pix[ni + 2] = Math.min(255, pix[ni + 2] + Math.round(b * ba));
                pix[ni + 3] = Math.min(255, pix[ni + 3] + Math.round(ba * 255));
              }
            }
          }
        }

        contagion *= Math.exp(-2.0 * dt);

        if (renderVisible) ctx!.putImageData(imgData, 0, 0);

        if (paused) {
          animRef.current = 0;
          return;
        }
        animRef.current = requestAnimationFrame(render);
      }

      animRef.current = requestAnimationFrame(render);

      return () => {
        cancelAnimationFrame(animRef.current);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointer);
        window.removeEventListener("pointerleave", onPointerLeave);
        window.removeEventListener("blur", onPointerLeave);
      };
    }, []);

    return (
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    );
  }
);

export default LandingParticleField;
