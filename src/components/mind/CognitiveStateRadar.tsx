/**
 * Hex radar chart for the 6 cognitive modulators.
 * Reference: luca-round2-mind-mnemos · m-state-svg.
 *
 * Vertices order (clockwise from top): openness, arousal, resolution,
 * social_drive, curiosity, focus. Each value is 0..1, mapped to one of
 * 4 concentric hex rings (max radius = 155 from center 220,220).
 */
interface Props {
  values: {
    openness: number;
    arousal: number;
    resolution: number;
    social_drive: number;
    curiosity: number;
    focus: number;
  };
}

const CENTER = 220;
const MAX_R = 155;
// Six axes, starting straight up, going clockwise.
const ANGLES = [-Math.PI / 2, -Math.PI / 6, Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6, 7 * Math.PI / 6];
const LABELS = ['OPENNESS', 'AROUSAL', 'RESOLUTION', 'SOCIAL DRIVE', 'CURIOSITY', 'FOCUS'];

function ring(scale: number) {
  return ANGLES.map((a) => {
    const r = MAX_R * scale;
    const x = CENTER + Math.cos(a) * r;
    const y = CENTER + Math.sin(a) * r;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function CognitiveStateRadar({ values }: Props) {
  const v = [values.openness, values.arousal, values.resolution, values.social_drive, values.curiosity, values.focus];
  const fillPts = ANGLES.map((a, i) => {
    const r = MAX_R * Math.max(0.02, Math.min(1, v[i]));
    const x = CENTER + Math.cos(a) * r;
    const y = CENTER + Math.sin(a) * r;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const labelOffsets = [
    { x: 0, y: -185, anchor: 'middle' },
    { x: 160, y: -92, anchor: 'start' },
    { x: 160, y: 92, anchor: 'start' },
    { x: 0, y: 185, anchor: 'middle' },
    { x: -160, y: 92, anchor: 'end' },
    { x: -160, y: -92, anchor: 'end' },
  ] as const;

  return (
    <svg viewBox="-30 0 500 440" className="m-state-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <polygon key={s} points={ring(s)} className="md-grid" />
      ))}
      {ANGLES.map((a, i) => {
        const x = CENTER + Math.cos(a) * MAX_R;
        const y = CENTER + Math.sin(a) * MAX_R;
        return <line key={i} x1={CENTER} y1={CENTER} x2={x.toFixed(1)} y2={y.toFixed(1)} className="md-spoke" />;
      })}
      <polygon points={fillPts.join(' ')} className="md-fill" />
      {fillPts.map((p, i) => {
        const [x, y] = p.split(',');
        return <circle key={i} cx={x} cy={y} r={3} className="md-vertex" />;
      })}
      {LABELS.map((label, i) => (
        <text
          key={label}
          x={CENTER + labelOffsets[i].x}
          y={CENTER + labelOffsets[i].y}
          textAnchor={labelOffsets[i].anchor}
          dominantBaseline="middle"
          className="md-label"
        >
          {label}
        </text>
      ))}
      <circle cx={CENTER} cy={CENTER} r={6} className="md-center-outer" />
      <circle cx={CENTER} cy={CENTER} r={2.5} className="md-center-inner" />
    </svg>
  );
}
