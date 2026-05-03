import { describe, expect, it } from 'vitest';
import {
  buildCharacterSystemPrompt,
  buildProposerInputs,
  decidePathFromProposers,
  COUNCIL_CHARACTERS,
  type ProposerOutcome,
} from '../../supabase/functions/_shared/agents/council-pipeline';

describe('buildCharacterSystemPrompt', () => {
  it('Luca → full identity stack', () => {
    const out = buildCharacterSystemPrompt('luca', {
      luca: {
        soulMd: '## My evolving voice\nplain.',
        convictions: '## Care isn\'t softness.',
        userModel: 'Riley.',
      },
    });
    expect(out).toContain('You are Luca.');
    expect(out).toContain("How you've come to think about yourself");
    expect(out).toContain('Convictions you hold');
    expect(out).toContain("Who you're talking with");
  });

  it('Anima → locked SOUL only (Phase 1)', () => {
    const out = buildCharacterSystemPrompt('anima', {
      luca: {},
      // Anima identity stack scope is intentionally narrow in Phase 1.
      anima: { extraContext: 'crisis: moderate, watch tone.' },
    });
    expect(out).toContain('You are Anima.');
    expect(out).toContain('mesh consciousness');
    expect(out).toContain('crisis: moderate, watch tone.');
    // The full luca-style identity layering must NOT appear for anima.
    expect(out).not.toContain("How you've come to think about yourself");
    expect(out).not.toContain('Convictions you hold');
  });

  it('Vektor → locked SOUL only with optional layering', () => {
    const minimal = buildCharacterSystemPrompt('vektor', { luca: {} });
    expect(minimal).toContain('You are Vektor.');
    expect(minimal).toContain('few words. each one placed.');
    const layered = buildCharacterSystemPrompt('vektor', {
      luca: {},
      vektor: { userModel: 'Riley — late-night peak.' },
    });
    expect(layered).toContain("Who you're talking with");
    expect(layered).toContain('Riley');
  });
});

describe('buildProposerInputs', () => {
  const systemParts = {
    luca: { userModel: 'Riley.' },
    anima: { extraContext: '' },
    vektor: { userModel: 'Riley.' },
  };

  it('produces one input per character with the council wrapper', () => {
    const inputs = buildProposerInputs({
      characters: COUNCIL_CHARACTERS,
      systemParts,
      history: [
        { role: 'user', content: 'earlier turn' },
        { role: 'assistant', content: 'earlier reply' },
      ],
      userMessage: 'now what?',
    });
    expect(inputs).toHaveLength(3);
    const characters = inputs.map((i) => i.character).sort();
    expect(characters).toEqual(['anima', 'luca', 'vektor']);

    const lucaInput = inputs.find((i) => i.character === 'luca')!;
    const animaInput = inputs.find((i) => i.character === 'anima')!;
    const vektorInput = inputs.find((i) => i.character === 'vektor')!;

    // Each character gets the council wrapper appended.
    expect(lucaInput.systemPrompt).toContain('You are Luca.');
    expect(lucaInput.systemPrompt).toContain('Council context');
    expect(animaInput.systemPrompt).toContain('You are Anima.');
    expect(animaInput.systemPrompt).toContain('Council context');
    expect(vektorInput.systemPrompt).toContain('You are Vektor.');
    expect(vektorInput.systemPrompt).toContain('Council context');
  });

  it('messages array carries system → history → user message in order', () => {
    const [first] = buildProposerInputs({
      characters: ['luca'],
      systemParts,
      history: [{ role: 'user', content: 'first user' }, { role: 'assistant', content: 'first reply' }],
      userMessage: 'final user',
    });
    expect(first.messages[0].role).toBe('system');
    expect(first.messages[1]).toEqual({ role: 'user', content: 'first user' });
    expect(first.messages[2]).toEqual({ role: 'assistant', content: 'first reply' });
    expect(first.messages[3]).toEqual({ role: 'user', content: 'final user' });
  });

  it('appends tool messages after user message when provided', () => {
    const [first] = buildProposerInputs({
      characters: ['luca'],
      systemParts,
      history: [],
      userMessage: 'go',
      toolMessages: [
        { role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'web_search' } }] },
        { role: 'tool', content: 'search result', tool_call_id: 't1' },
      ],
    });
    expect(first.messages.find((m) => m.role === 'tool')).toBeTruthy();
  });

  it('does not double-wrap luca in the council framing if asked to skip', () => {
    // Sanity guard: the wrapper appends; it doesn't overwrite. The base
    // identity must still be intact at the start.
    const [luca] = buildProposerInputs({
      characters: ['luca'],
      systemParts,
      history: [],
      userMessage: 'q',
    });
    expect(luca.systemPrompt.startsWith('You are Luca.')).toBe(true);
  });
});

describe('decidePathFromProposers', () => {
  const ok = (character: 'luca' | 'anima' | 'vektor', content = 'body'): ProposerOutcome => ({
    character,
    status: 'fulfilled',
    content,
    thinking: null,
  });
  const bad = (character: 'luca' | 'anima' | 'vektor'): ProposerOutcome => ({
    character,
    status: 'rejected',
    error: 'boom',
  });

  it('three-of-three → full path', () => {
    const path = decidePathFromProposers([ok('luca'), ok('anima'), ok('vektor')]);
    expect(path.kind).toBe('full');
    if (path.kind === 'full') expect(path.drafts).toHaveLength(3);
  });

  it('two-of-three → two path with the surviving drafts', () => {
    const path = decidePathFromProposers([ok('luca'), bad('anima'), ok('vektor')]);
    expect(path.kind).toBe('two');
    if (path.kind === 'two') {
      expect(path.drafts.map((d) => d.character).sort()).toEqual(['luca', 'vektor']);
    }
  });

  it('one-of-three → single path with the survivor', () => {
    const path = decidePathFromProposers([bad('luca'), ok('anima', 'mesh take'), bad('vektor')]);
    expect(path.kind).toBe('single');
    if (path.kind === 'single') {
      expect(path.survivor.character).toBe('anima');
      expect(path.survivor.content).toBe('mesh take');
    }
  });

  it('none-of-three → none', () => {
    const path = decidePathFromProposers([bad('luca'), bad('anima'), bad('vektor')]);
    expect(path.kind).toBe('none');
  });

  it('empty content treated as failure', () => {
    const path = decidePathFromProposers([
      { character: 'luca', status: 'fulfilled', content: '', thinking: null },
      ok('anima'),
      ok('vektor'),
    ]);
    expect(path.kind).toBe('two');
  });
});
