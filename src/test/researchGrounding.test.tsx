import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GroundingGlyph,
  canSaveGroundedTruthCard,
  groundingDescription,
  groundingLabel,
  normalizeGroundingLevel,
} from '@/components/research/GroundingGlyph';

describe('research grounding language', () => {
  it('maps The Well evidence aliases onto the four-level grounding ladder', () => {
    expect(normalizeGroundingLevel('simulation-direct')).toBe('measured');
    expect(normalizeGroundingLevel('simulation-proxy')).toBe('derived');
    expect(normalizeGroundingLevel('catalog-only')).toBe('referenced');
    expect(normalizeGroundingLevel('asserted')).toBe('asserted');
  });

  it('keeps asserted reasoning out of saveable truth cards', () => {
    expect(canSaveGroundedTruthCard('simulation-direct')).toBe(true);
    expect(canSaveGroundedTruthCard('catalog-only')).toBe(true);
    expect(canSaveGroundedTruthCard('asserted')).toBe(false);
    expect(groundingLabel('simulation-proxy')).toBe('derived');
    expect(groundingDescription('asserted')).toContain('without external grounding');
  });

  it('renders a labelled monochrome glyph for evidence cards', () => {
    render(<GroundingGlyph level="catalog-only" label />);

    expect(screen.getByLabelText('referenced evidence')).toBeInTheDocument();
    expect(screen.getByText('referenced')).toBeInTheDocument();
  });
});
