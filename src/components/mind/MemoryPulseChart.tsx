/**
 * 24h activity pulse chart — area + line + "now" dot.
 * Reference: luca-round2-mind-mnemos · m-pulse-svg.
 *
 * Accepts an array of values (one per quarter-hour bucket — 96 ideal,
 * but any length is rendered across the full width). NOTE: Until we
 * wire real bucket data, the parent passes a deterministic mock series.
 */
interface Props {
  /** 0..1 normalized values, one per bucket. */
  values: number[];
}

const W = 600;
const H = 80;
const PAD_X = 8;
const TOP = 10;
const BOTTOM = 58;

export default function MemoryPulseChart({ values }: Props) {
  const n = values.length;
  if (n === 0) return null;
  const usableW = W - PAD_X * 2;
  const points = values.map((v, i) => {
    const x = PAD_X + (i / Math.max(1, n - 1)) * usableW;
    const y = TOP + (1 - Math.max(0, Math.min(1, v))) * (BOTTOM - TOP);
    return { x, y };
  });

  const lineStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaStr = `${lineStr} ${points[n - 1].x.toFixed(1)},${BOTTOM} ${points[0].x.toFixed(1)},${BOTTOM}`;
  const last = points[n - 1];

  // Tick label x positions (00, 06, 12, 18, NOW)
  const tickX = [0, 0.25, 0.5, 0.75, 1].map((p) => PAD_X + p * usableW);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="m-pulse-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <polygon points={areaStr} className="mp-area" />
      <polyline points={lineStr} className="mp-line" />
      <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r={3} className="mp-now" />
      <text x={tickX[0].toFixed(1)} y={74} textAnchor="middle" className="mp-tick">00</text>
      <text x={tickX[1].toFixed(1)} y={74} textAnchor="middle" className="mp-tick">06</text>
      <text x={tickX[2].toFixed(1)} y={74} textAnchor="middle" className="mp-tick">12</text>
      <text x={tickX[3].toFixed(1)} y={74} textAnchor="middle" className="mp-tick">18</text>
      <text x={tickX[4].toFixed(1)} y={74} textAnchor="end" className="mp-tick">NOW</text>
    </svg>
  );
}
