import type { CSSProperties } from 'react';

export type GroundingLevel = 'measured' | 'derived' | 'referenced' | 'asserted';
export type GroundingEvidenceLevel = GroundingLevel | 'simulation-direct' | 'simulation-proxy' | 'catalog-only' | string | null | undefined;

const GROUNDING_COPY: Record<GroundingLevel, { label: string; description: string }> = {
  measured: {
    label: 'measured',
    description: 'Primary artifact Luca ran or pulled; reproducible.',
  },
  derived: {
    label: 'derived',
    description: 'Computed from a cited finding, related run, or statistic.',
  },
  referenced: {
    label: 'referenced',
    description: 'Source is known and located; primary was not pulled into evidence.',
  },
  asserted: {
    label: 'asserted',
    description: 'Model reasoning without external grounding.',
  },
};

export function normalizeGroundingLevel(level: GroundingEvidenceLevel): GroundingLevel {
  if (level === 'simulation-direct' || level === 'measured') return 'measured';
  if (level === 'simulation-proxy' || level === 'derived') return 'derived';
  if (level === 'catalog-only' || level === 'referenced') return 'referenced';
  return 'asserted';
}

export function groundingLabel(level: GroundingEvidenceLevel): string {
  return GROUNDING_COPY[normalizeGroundingLevel(level)].label;
}

export function groundingDescription(level: GroundingEvidenceLevel): string {
  return GROUNDING_COPY[normalizeGroundingLevel(level)].description;
}

export function canSaveGroundedTruthCard(level: GroundingEvidenceLevel): boolean {
  return normalizeGroundingLevel(level) !== 'asserted';
}

interface GroundingGlyphProps {
  level: GroundingEvidenceLevel;
  label?: boolean;
  description?: boolean;
  size?: number;
  style?: CSSProperties;
}

export function GroundingGlyph({
  level,
  label = false,
  description = false,
  size = 11,
  style,
}: GroundingGlyphProps) {
  const normalized = normalizeGroundingLevel(level);
  const copy = GROUNDING_COPY[normalized];

  return (
    <span
      style={{ ...glyphWrapStyle, ...style }}
      aria-label={`${copy.label} evidence`}
      title={`${copy.label}: ${copy.description}`}
      data-grounding={normalized}
    >
      <span aria-hidden="true" style={dotStyle(normalized, size)} />
      {label && <span style={glyphLabelStyle}>{copy.label}</span>}
      {description && <span style={glyphDescriptionStyle}>{copy.description}</span>}
    </span>
  );
}

const glyphWrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
};

const glyphLabelStyle: CSSProperties = {
  color: 'var(--research-t-hi, rgba(245,245,245,0.94))',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: 'var(--track-mono)',
  textTransform: 'uppercase',
};

const glyphDescriptionStyle: CSSProperties = {
  minWidth: 0,
  color: 'var(--research-t-dim, rgba(138,138,138,0.94))',
  fontSize: 12,
  lineHeight: 1.45,
};

const dotStyle = (level: GroundingLevel, size: number): CSSProperties => {
  const base: CSSProperties = {
    width: size,
    height: size,
    flex: '0 0 auto',
    borderRadius: '50%',
  };

  if (level === 'measured') {
    return {
      ...base,
      background: 'var(--research-t-hi, rgba(245,245,245,0.96))',
    };
  }

  if (level === 'derived') {
    return {
      ...base,
      border: '1.5px solid var(--research-t-hi, rgba(245,245,245,0.94))',
      background: 'linear-gradient(90deg, var(--research-t-hi, rgba(245,245,245,0.96)) 0 50%, transparent 50% 100%)',
    };
  }

  if (level === 'referenced') {
    return {
      ...base,
      border: '1.5px solid var(--research-t-dim, rgba(138,138,138,0.94))',
      background: 'transparent',
    };
  }

  return {
    ...base,
    border: '1.5px dotted var(--research-t-faint, rgba(86,86,86,0.9))',
    background: 'transparent',
  };
};
