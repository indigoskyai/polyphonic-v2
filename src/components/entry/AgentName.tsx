import { deriveAgent } from './AgentDot';

/** Lowercase mono agent name — pairs with AgentDot in entry headers. */
export default function AgentName({ agent }: { agent: string | null | undefined }) {
  const name = deriveAgent(agent);
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-soft)',
        letterSpacing: 'var(--track-mono)',
      }}
    >
      {name}
    </span>
  );
}
