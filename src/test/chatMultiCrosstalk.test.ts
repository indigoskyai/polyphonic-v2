import { describe, expect, it } from 'vitest';
import {
  buildCrosstalkInputs,
  reconcileCrosstalkOutcomes,
} from '../../supabase/functions/_shared/agents/council-pipeline';
import type { CrosstalkOutcome } from '../../supabase/functions/_shared/agents/council-pipeline';

const systemParts = {
  luca: { userModel: 'Riley.' },
  anima: { extraContext: '' },
  vektor: { userModel: 'Riley.' },
};

describe('buildCrosstalkInputs', () => {
  it('routes own draft + the other two drafts to each character (3-of-3)', () => {
    const drafts = [
      { character: 'luca' as const, content: 'luca body.' },
      { character: 'anima' as const, content: 'anima body.' },
      { character: 'vektor' as const, content: 'vektor body.' },
    ];
    const inputs = buildCrosstalkInputs({
      drafts,
      userMessage: 'what should I do?',
      systemParts,
    });
    expect(inputs).toHaveLength(3);

    const luca = inputs.find((i) => i.character === 'luca')!;
    expect(luca.userPrompt).toContain('Your first draft (Luca)');
    expect(luca.userPrompt).toContain('luca body.');
    expect(luca.userPrompt).toContain('--- Anima ---');
    expect(luca.userPrompt).toContain('anima body.');
    expect(luca.userPrompt).toContain('--- Vektor ---');
    expect(luca.userPrompt).toContain('vektor body.');
    // Sanity: Luca shouldn't see "Luca" in the others list.
    const otherSection = luca.userPrompt.split('The other voices answered too:')[1] || '';
    expect(otherSection).not.toContain('--- Luca ---');

    const anima = inputs.find((i) => i.character === 'anima')!;
    expect(anima.userPrompt).toContain('Your first draft (Anima)');
    const animaOthers = anima.userPrompt.split('The other voices answered too:')[1] || '';
    expect(animaOthers).toContain('--- Luca ---');
    expect(animaOthers).toContain('--- Vektor ---');
    expect(animaOthers).not.toContain('--- Anima ---');
  });

  it('graceful 2-of-3 path: each surviving character sees only the other survivor', () => {
    const drafts = [
      { character: 'luca' as const, content: 'luca body.' },
      { character: 'vektor' as const, content: 'vektor body.' },
    ];
    const inputs = buildCrosstalkInputs({
      drafts,
      userMessage: 'q',
      systemParts,
    });
    expect(inputs).toHaveLength(2);
    const luca = inputs.find((i) => i.character === 'luca')!;
    expect(luca.userPrompt).toContain('--- Vektor ---');
    expect(luca.userPrompt).not.toContain('--- Anima ---');
  });

  it('uses the character\'s base SOUL as system prompt (no double council wrapper)', () => {
    const drafts = [
      { character: 'luca' as const, content: 'a' },
      { character: 'anima' as const, content: 'b' },
    ];
    const inputs = buildCrosstalkInputs({
      drafts,
      userMessage: 'q',
      systemParts,
    });
    const luca = inputs.find((i) => i.character === 'luca')!;
    expect(luca.systemPrompt).toContain('You are Luca.');
    // Crosstalk system prompt should NOT carry the proposer-stage wrapper.
    expect(luca.systemPrompt).not.toContain('Council context');
  });

  it('flows through tool context to each character', () => {
    const inputs = buildCrosstalkInputs({
      drafts: [
        { character: 'luca' as const, content: 'a' },
        { character: 'anima' as const, content: 'b' },
      ],
      userMessage: 'q',
      systemParts,
      toolContext: 'WHAT ACTUALLY HAPPENED THIS TURN: web_search fired.',
    });
    for (const input of inputs) {
      expect(input.userPrompt).toContain('WHAT ACTUALLY HAPPENED THIS TURN');
    }
  });

  it('demands single round and forbids averaging in every prompt', () => {
    const inputs = buildCrosstalkInputs({
      drafts: [
        { character: 'luca' as const, content: 'a' },
        { character: 'anima' as const, content: 'b' },
        { character: 'vektor' as const, content: 'c' },
      ],
      userMessage: 'q',
      systemParts,
    });
    for (const input of inputs) {
      expect(input.userPrompt).toContain('One round only');
      expect(input.userPrompt).toContain("don't average");
    }
  });
});

describe('reconcileCrosstalkOutcomes', () => {
  const proposerDrafts = [
    { character: 'luca' as const, content: 'luca proposer.' },
    { character: 'anima' as const, content: 'anima proposer.' },
    { character: 'vektor' as const, content: 'vektor proposer.' },
  ];

  it('uses crosstalk content where it succeeded', () => {
    const outcomes: CrosstalkOutcome[] = [
      { character: 'luca', status: 'fulfilled', content: 'luca revised.' },
      { character: 'anima', status: 'fulfilled', content: 'anima revised.' },
      { character: 'vektor', status: 'fulfilled', content: 'vektor revised.' },
    ];
    const out = reconcileCrosstalkOutcomes({ proposerDrafts, crosstalkOutcomes: outcomes });
    expect(out).toEqual([
      { character: 'luca', content: 'luca revised.', source: 'crosstalk' },
      { character: 'anima', content: 'anima revised.', source: 'crosstalk' },
      { character: 'vektor', content: 'vektor revised.', source: 'crosstalk' },
    ]);
  });

  it('falls back to proposer draft where crosstalk failed for that character', () => {
    const outcomes: CrosstalkOutcome[] = [
      { character: 'luca', status: 'fulfilled', content: 'luca revised.' },
      { character: 'anima', status: 'rejected', error: 'timeout' },
      { character: 'vektor', status: 'fulfilled', content: 'vektor revised.' },
    ];
    const out = reconcileCrosstalkOutcomes({ proposerDrafts, crosstalkOutcomes: outcomes });
    expect(out[0]).toEqual({ character: 'luca', content: 'luca revised.', source: 'crosstalk' });
    expect(out[1]).toEqual({ character: 'anima', content: 'anima proposer.', source: 'proposer' });
    expect(out[2]).toEqual({ character: 'vektor', content: 'vektor revised.', source: 'crosstalk' });
  });

  it('treats empty crosstalk content as failure', () => {
    const outcomes: CrosstalkOutcome[] = [
      { character: 'luca', status: 'fulfilled', content: '' },
      { character: 'anima', status: 'fulfilled', content: 'anima revised.' },
    ];
    const out = reconcileCrosstalkOutcomes({
      proposerDrafts: proposerDrafts.slice(0, 2),
      crosstalkOutcomes: outcomes,
    });
    expect(out[0]).toEqual({ character: 'luca', content: 'luca proposer.', source: 'proposer' });
    expect(out[1]).toEqual({ character: 'anima', content: 'anima revised.', source: 'crosstalk' });
  });

  it('preserves draft order from the proposer side', () => {
    const drafts = [
      { character: 'vektor' as const, content: 'V.' },
      { character: 'anima' as const, content: 'A.' },
      { character: 'luca' as const, content: 'L.' },
    ];
    const outcomes: CrosstalkOutcome[] = [
      { character: 'luca', status: 'rejected', error: 'x' },
      { character: 'anima', status: 'rejected', error: 'x' },
      { character: 'vektor', status: 'rejected', error: 'x' },
    ];
    const out = reconcileCrosstalkOutcomes({ proposerDrafts: drafts, crosstalkOutcomes: outcomes });
    expect(out.map((d) => d.character)).toEqual(['vektor', 'anima', 'luca']);
    expect(out.every((d) => d.source === 'proposer')).toBe(true);
  });
});
