/** Uppercase section label — PROVENANCE, EVIDENCE, RELATED MEMORIES. */
export default function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: 'var(--track-meta)',
        textTransform: 'uppercase',
        color: 'var(--text-ghost)',
        marginBottom: 10,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {children}
    </div>
  );
}
