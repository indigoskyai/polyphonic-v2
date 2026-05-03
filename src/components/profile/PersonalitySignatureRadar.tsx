/**
 * Personality Signature radar — OCEAN/Big Five analog of CognitiveStateRadar.
 * Five axes (pentagon), each value 0..1, four concentric reference rings.
 * Monochromatic, matches the Mind design language.
 */
interface Props {
  values: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
}

const CENTER = 220;
const MAX_R = 155;
// Five axes, starting straight up, going clockwise.
const ANGLES = [
  -Math.PI / 2,
  -Math.PI / 2 + (2 * Math.PI) / 5,
  -Math.PI / 2 + (4 * Math.PI) / 5,
  -Math.PI / 2 + (6 * Math.PI) / 5,
  -Math.PI / 2 + (8 * Math.PI) / 5,
];
const LABELS = ['OPENNESS', 'CONSCIENTIOUS', 'EXTRAVERSION', 'AGREEABLENESS', 'NEUROTICISM'];

function ring(scale: number) {
  return ANGLES.map((a) => {
    const r = MAX_R * scale;
    const x = CENTER + Math.cos(a) * r;
    const y = CENTER + Math.sin(a) * r;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function PersonalitySignatureRadar({ values }: Props) {
  const v = [
    values.openness,
    values.conscientiousness,
    values.extraversion,
    values.agreeableness,
    values.neuroticism,
  ];
  const fillPts = ANGLES.map((a, i) => {
    const r = MAX_R * Math.max(0.02, Math.min(1, v[i]));
    const x = CENTER + Math.cos(a) * r;
    const y = CENTER + Math.sin(a) * r;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox="0 0 440 440" className="m-state-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
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
      {LABELS.map((label, i) => {
        const a = ANGLES[i];
        const lr = MAX_R + 26;
        const x = CENTER + Math.cos(a) * lr;
        const y = CENTER + Math.sin(a) * lr;
        const cosA = Math.cos(a);
        const anchor = Math.abs(cosA) < 0.2 ? 'middle' : cosA > 0 ? 'start' : 'end';
        return (
          <text
            key={label}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="md-label"
          >
            {label}
          </text>
        );
      })}
      <circle cx={CENTER} cy={CENTER} r={6} className="md-center-outer" />
      <circle cx={CENTER} cy={CENTER} r={2.5} className="md-center-inner" />
    </svg>
  );
}
