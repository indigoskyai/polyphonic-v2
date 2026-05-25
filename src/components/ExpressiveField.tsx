import { useEffect, useRef } from 'react';
import expressiveField from '@/lib/expressiveField';

export type ExpressiveFieldState = 'idle' | 'listening' | 'speaking' | 'thinking';

interface Props {
  /** Container size in pixels (square). The internal canvas auto-DPI-scales. */
  size?: number;
  /** Particle count override. Default 30000 from the engine. */
  particleCount?: number;
  /** Drives shape morphing + audio simulation. */
  state?: ExpressiveFieldState;
  /** Optional manual shape override (0–11). null = auto-cycle through shapes. */
  shape?: number | null;
  /** Inline style passthrough on the container. */
  style?: React.CSSProperties;
  /** Optional className on the container. */
  className?: string;
}

/**
 * ExpressiveField — Polyphonic's signature particle visualizer.
 *
 * Wraps the Sovereign Mind expressive-field engine (see
 * `src/lib/expressiveField.js`). Mounts a canvas inside a container,
 * initialises the engine, and proxies `state` + `shape` props through to
 * the engine API. On unmount, calls `destroy()` to cancel the rAF loop.
 *
 * The engine is a singleton (one per page). If two ExpressiveField
 * components are ever mounted simultaneously, the second one will
 * effectively re-init the engine onto its own canvas, abandoning the
 * first. That's acceptable for the chat empty state (one instance only).
 */
export default function ExpressiveField({
  size = 360,
  particleCount,
  state = 'idle',
  shape = null,
  style,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initedRef = useRef(false);

  // Mount: init engine. Unmount: destroy.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    expressiveField.init(canvas, container);
    initedRef.current = true;

    // Apply optional particle count override after init.
    if (typeof particleCount === 'number' && particleCount > 0) {
      expressiveField.setParticleCount(particleCount);
    }

    // Respect prefers-reduced-motion: let the field form, then freeze the last
    // frame instead of animating perpetually (WCAG 2.2.2). destroy() cancels
    // the rAF loop and leaves the formed shape rendered on the canvas.
    let reduceHoldTimer: number | undefined;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      reduceHoldTimer = window.setTimeout(() => expressiveField.destroy(), 2800);
    }

    // Resize on container changes (responsive layouts, viewport rotations).
    const ro = new ResizeObserver(() => {
      expressiveField.resize();
    });
    ro.observe(container);

    return () => {
      if (reduceHoldTimer) window.clearTimeout(reduceHoldTimer);
      ro.disconnect();
      expressiveField.destroy();
      initedRef.current = false;
    };
    // particleCount intentionally not in deps — changes via setParticleCount
    // would re-init particles, which we handle in a dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply state changes.
  useEffect(() => {
    if (!initedRef.current) return;
    expressiveField.setState(state);
  }, [state]);

  // Apply manual shape changes.
  useEffect(() => {
    if (!initedRef.current) return;
    if (typeof shape === 'number') {
      expressiveField.setShape(shape);
    }
  }, [shape]);

  // Apply particle count changes after mount.
  useEffect(() => {
    if (!initedRef.current) return;
    if (typeof particleCount === 'number' && particleCount > 0) {
      expressiveField.setParticleCount(particleCount);
    }
  }, [particleCount]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: size,
        height: size,
        position: 'relative',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
