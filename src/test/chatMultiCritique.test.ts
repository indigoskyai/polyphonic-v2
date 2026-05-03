import { describe, expect, it } from 'vitest';
import { decideCritiqueAction } from '../../supabase/functions/_shared/agents/council-pipeline';
import type { VoiceCritiqueResult } from '../../supabase/functions/_shared/agents/council-prompts';

const drift = (overrides: Partial<VoiceCritiqueResult> = {}): VoiceCritiqueResult => ({
  voice_drift_detected: true,
  confidence: 0.85,
  critique: 'close paragraph reads like generic warmth.',
  suggested_revision: 'shorten the close; drop softening qualifier.',
  ...overrides,
});

const noDrift: VoiceCritiqueResult = {
  voice_drift_detected: false,
  confidence: 0.95,
  critique: 'voices preserved.',
  suggested_revision: null,
};

describe('decideCritiqueAction', () => {
  it('passthrough when no critique result was produced', () => {
    expect(decideCritiqueAction(null, true)).toEqual({ kind: 'passthrough' });
  });

  it('passthrough when no drift was detected', () => {
    expect(decideCritiqueAction(noDrift, true)).toEqual({ kind: 'passthrough' });
  });

  it('passthrough when refusal is disabled, even if drift detected', () => {
    expect(decideCritiqueAction(drift(), false)).toEqual({ kind: 'passthrough' });
  });

  it('passthrough when confidence is below 0.7', () => {
    expect(decideCritiqueAction(drift({ confidence: 0.69 }), true)).toEqual({ kind: 'passthrough' });
  });

  it('passthrough when suggested_revision is empty', () => {
    expect(decideCritiqueAction(drift({ suggested_revision: '' }), true)).toEqual({ kind: 'passthrough' });
    expect(decideCritiqueAction(drift({ suggested_revision: '   ' }), true)).toEqual({ kind: 'passthrough' });
    expect(decideCritiqueAction(drift({ suggested_revision: null }), true)).toEqual({ kind: 'passthrough' });
  });

  it('revise when all gates open: drift + confidence ≥ 0.7 + refusal enabled + revision present', () => {
    const out = decideCritiqueAction(drift(), true);
    expect(out.kind).toBe('revise');
    if (out.kind === 'revise') {
      expect(out.reason).toBe('shorten the close; drop softening qualifier.');
    }
  });

  it('revise at exactly the 0.7 confidence threshold', () => {
    const out = decideCritiqueAction(drift({ confidence: 0.7 }), true);
    expect(out.kind).toBe('revise');
  });

  it('passthrough at 0.69 (just below threshold)', () => {
    const out = decideCritiqueAction(drift({ confidence: 0.69 }), true);
    expect(out.kind).toBe('passthrough');
  });

  it('trims whitespace in the revise reason', () => {
    const out = decideCritiqueAction(drift({ suggested_revision: '   tighter close.   \n' }), true);
    if (out.kind === 'revise') {
      expect(out.reason).toBe('tighter close.');
    } else {
      throw new Error('expected revise');
    }
  });
});
