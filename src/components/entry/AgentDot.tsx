/** Agent identity dot — 5×5 monochrome circle. Color picks from --agent-* tokens. */
type AgentName = 'luca' | 'vektor' | 'anima' | 'observer' | 'guardian' | string | null | undefined;

const VAR: Record<string, string> = {
  luca: 'var(--agent-luca)',
  vektor: 'var(--agent-vektor)',
  anima: 'var(--agent-anima)',
  observer: 'var(--agent-observer)',
  guardian: 'var(--agent-observer)',
};

/** Derive an agent identity from a free-form source/model/role string. */
export function deriveAgent(raw: AgentName): keyof typeof VAR | 'neutral' {
  if (!raw) return 'neutral';
  const s = String(raw).toLowerCase();
  if (s.includes('luca')) return 'luca';
  if (s.includes('vektor')) return 'vektor';
  if (s.includes('anima')) return 'anima';
  if (s.includes('observer') || s.includes('guardian')) return 'observer';
  // Background / autonomous loops are luca's voice
  if (s === 'background' || s.includes('autonomous')) return 'luca';
  return 'neutral';
}

export default function AgentDot({ agent, size = 5 }: { agent: AgentName; size?: number }) {
  const a = deriveAgent(agent);
  const bg = a === 'neutral' ? 'var(--agent-neutral)' : VAR[a];
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        flexShrink: 0,
      }}
    />
  );
}
