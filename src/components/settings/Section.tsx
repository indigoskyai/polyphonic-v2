import React from 'react';

/* ======================================================================
   Section — a numbered settings section with eye + title + description.

   Used inside .set-body to compose settings pages from numbered sections.
   Each section is divided from the next by a hairline border.

   Example:
     <Section number="01" name="Identity" title="Email and plan"
              desc="Sign-in identity and subscription tier.">
       <AccountRow ... />
       <AccountRow ... />
     </Section>
   ====================================================================== */

interface SectionProps {
  number: string; // "01", "02", "03"…
  name: string; // "Identity"
  title: string; // "Email and plan"
  desc?: React.ReactNode;
  pill?: React.ReactNode;
  destructive?: boolean;
  children: React.ReactNode;
}

export function Section({
  number,
  name,
  title,
  desc,
  pill,
  destructive,
  children,
}: SectionProps) {
  return (
    <div className="set-section">
      <div className={`set-section-eye${destructive ? ' destructive' : ''}`}>
        <span className="num">{number}</span>
        <span>{name}</span>
        {pill}
      </div>
      <div className="set-section-title">{title}</div>
      {desc && <p className="set-section-desc">{desc}</p>}
      {children}
    </div>
  );
}

/* InlinePill — used inside section eye for "Under construction" markers. */
export function InlinePill({
  children,
  variant = 'amber',
}: {
  children: React.ReactNode;
  variant?: 'amber' | 'rose';
}) {
  const styles =
    variant === 'rose'
      ? {
          color: 'var(--rose-accent, #c97c8a)',
          background: 'rgba(201, 124, 138, 0.04)',
          border: '1px solid rgba(201, 124, 138, 0.20)',
        }
      : {
          color: 'var(--amber-soft, #d9a744)',
          background: 'rgba(217, 167, 68, 0.04)',
          border: '1px solid rgba(217, 167, 68, 0.20)',
        };

  return (
    <span
      style={{
        ...styles,
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: 'var(--track-folio)',
        textTransform: 'uppercase',
        borderRadius: 999,
        marginLeft: 6,
      }}
    >
      {children}
    </span>
  );
}

/* Kbd — keyboard hint inline (e.g. ⌘E). */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="kbd">{children}</span>;
}
