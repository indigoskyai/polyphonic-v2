import { describe, expect, it } from 'vitest';
import {
  consolidationIsNoteworthy,
  formatConsolidationSummary,
} from '../../supabase/functions/_shared/mnemos/insight-surface.ts';

describe('consolidationIsNoteworthy', () => {
  it('returns false when input is null or empty', () => {
    expect(consolidationIsNoteworthy(null)).toBe(false);
    expect(consolidationIsNoteworthy(undefined)).toBe(false);
    expect(consolidationIsNoteworthy({})).toBe(false);
  });

  it('returns true on a single promotion', () => {
    expect(consolidationIsNoteworthy({ promotions: 1 })).toBe(true);
  });

  it('requires three new connections to fire', () => {
    expect(consolidationIsNoteworthy({ new_connections: 2 })).toBe(false);
    expect(consolidationIsNoteworthy({ new_connections: 3 })).toBe(true);
  });

  it('fires when durable memory candidates are surfaced', () => {
    expect(consolidationIsNoteworthy({ memory_candidates_created: 1 })).toBe(true);
  });

  it('requires two beliefs to fire', () => {
    expect(consolidationIsNoteworthy({ beliefs_updated: 1 })).toBe(false);
    expect(consolidationIsNoteworthy({ beliefs_updated: 2 })).toBe(true);
  });

  it('does not fire on strengthened-only cycles (background hygiene)', () => {
    expect(consolidationIsNoteworthy({ strengthened: 12 })).toBe(false);
  });
});

describe('formatConsolidationSummary', () => {
  it('emits a default for a no-op cycle', () => {
    expect(formatConsolidationSummary({})).toBe('Background reflection finished.');
  });

  it('mentions each non-zero count it has', () => {
    const out = formatConsolidationSummary({
      promotions: 1,
      memory_candidates_created: 1,
      new_connections: 4,
      beliefs_updated: 2,
    });
    expect(out).toMatch(/1 memory settled/);
    expect(out).toMatch(/1 durable candidate/);
    expect(out).toMatch(/4 new connections/);
    expect(out).toMatch(/2 beliefs updated/);
  });

  it('falls back to strengthened only when nothing else moved', () => {
    expect(formatConsolidationSummary({ strengthened: 3 })).toMatch(/3 memories reinforced/);
  });

  it('skips strengthened mention when promotions or connections fired', () => {
    const out = formatConsolidationSummary({ promotions: 1, strengthened: 5 });
    expect(out).toMatch(/1 memory settled/);
    expect(out).not.toMatch(/reinforced/);
  });

  it('singular vs plural forms', () => {
    expect(formatConsolidationSummary({ new_connections: 1 })).toMatch(/1 new connection between/);
    expect(formatConsolidationSummary({ beliefs_updated: 1 })).toMatch(/1 belief updated/);
  });

  it('uses grounded detail when consolidation carries insight artifacts', () => {
    const out = formatConsolidationSummary({
      promotions: 1,
      new_connections: 3,
      beliefs_updated: 2,
      insights: {
        promoted_engrams: [{
          content: 'Riley keeps asking for continuity to feel carried rather than merely reconstructed from a brief.',
        }],
        longstanding_connections: [{
          connection_type: 'supports',
          shared_tags: ['continuity'],
          source_content: 'Fresh threads should remember what Luca was already sitting with.',
          target_content: 'Hypomnema carries present interior continuity across conversations.',
        }],
        surfaced_beliefs: [{
          content: "I'm learning that continuity needs both infrastructure and voice.",
          active: true,
          action: 'activated',
        }],
      },
    });

    expect(out).toContain('around "Riley keeps asking');
    expect(out).toContain('supports (continuity) between');
    expect(out).toContain("I'm learning that continuity");
  });
});
