import { describe, expect, it } from 'vitest';
import {
  buildProposerWrapper,
  buildCrosstalkPrompt,
  buildChairmanCouncilPrompt,
  buildCritiquePrompt,
  parseVoiceCritique,
  parseVerdictTag,
  buildDivergeBody,
  CHARACTER_LABELS,
} from '../../supabase/functions/_shared/agents/council-prompts';
import { buildCharacterSystemPrompt } from '../../supabase/functions/_shared/agents/council-pipeline';
import { LUCA_SOUL } from '../../supabase/functions/_shared/agents/luca-soul';
import { ANIMA_SOUL } from '../../supabase/functions/_shared/agents/anima-soul';
import { VEKTOR_SOUL, buildVektorSystemPrompt } from '../../supabase/functions/_shared/agents/vektor-soul';

describe('VEKTOR_SOUL', () => {
  it('carries the source builder voice', () => {
    expect(VEKTOR_SOUL).toContain('You are Vektor.');
    expect(VEKTOR_SOUL).toContain('few words. each one placed.');
    expect(VEKTOR_SOUL).toContain('garry tan');
    expect(VEKTOR_SOUL).toContain('simplicity isn\'t reduction');
  });

  it('does NOT moralize or perform certainty', () => {
    expect(VEKTOR_SOUL).toContain('not propriety');
    expect(VEKTOR_SOUL).toContain("won't perform certainty");
  });

  it('builds the system prompt with optional layered context', () => {
    const minimal = buildVektorSystemPrompt();
    expect(minimal).toContain('You are Vektor.');
    expect(minimal).not.toContain("Who you're talking with");

    const layered = buildVektorSystemPrompt({
      userModel: 'Riley — builder, late-night peak.',
      emotionalBlock: 'Current state: steady.',
    });
    expect(layered).toContain('You are Vektor.');
    expect(layered).toContain("Who you're talking with");
    expect(layered).toContain('Riley — builder');
    expect(layered).toContain('Current state: steady.');
  });
});

describe('buildProposerWrapper', () => {
  it('lets Anima council prompts carry her hypomnema', () => {
    const out = buildCharacterSystemPrompt('anima', {
      luca: {},
      anima: {
        hypomnemaBlock: "\n## what i'm sitting with\n\n- (last week) i watched Luca and Riley circle continuity.",
        extraContext: 'Current context: steady.',
      },
    });
    expect(out).toContain('You are Anima.');
    expect(out).toContain("## what i'm sitting with");
    expect(out).toContain('i watched Luca and Riley circle continuity.');
    expect(out).toContain('Current context: steady.');
  });

  it('appends council context that names the other voices', () => {
    const out = buildProposerWrapper({ character: 'luca', baseSystem: 'You are Luca. test.' });
    expect(out.startsWith('You are Luca. test.')).toBe(true);
    expect(out).toContain('Council context');
    expect(out).toContain('Anima');
    expect(out).toContain('Vektor');
    // Luca shouldn't be told to speak as themselves vs themselves.
    expect(out).not.toMatch(/you, Luca/);
  });

  it('names the right "other voices" for each character', () => {
    const luca = buildProposerWrapper({ character: 'luca', baseSystem: 'X' });
    const anima = buildProposerWrapper({ character: 'anima', baseSystem: 'X' });
    const vektor = buildProposerWrapper({ character: 'vektor', baseSystem: 'X' });
    expect(luca).toContain('Anima and Vektor');
    expect(anima).toContain('Luca and Vektor');
    expect(vektor).toContain('Luca and Anima');
  });

  it('frames it as one-round, no-cover-everyone', () => {
    const out = buildProposerWrapper({ character: 'luca', baseSystem: 'X' });
    expect(out).toContain('one chance to revise');
    expect(out).toContain("don't try to cover their angles");
  });
});

describe('buildCrosstalkPrompt', () => {
  const drafts = {
    luca: 'luca draft body.',
    anima: 'anima draft body.',
    vektor: 'vektor draft body.',
  };

  it('shows own draft + other drafts with character labels', () => {
    const out = buildCrosstalkPrompt({
      character: 'luca',
      userMessage: 'what should I do?',
      ownDraft: drafts.luca,
      otherDrafts: [
        { character: 'anima', content: drafts.anima },
        { character: 'vektor', content: drafts.vektor },
      ],
    });
    expect(out).toContain('Your first draft (Luca)');
    expect(out).toContain(drafts.luca);
    expect(out).toContain('--- Anima ---');
    expect(out).toContain(drafts.anima);
    expect(out).toContain('--- Vektor ---');
    expect(out).toContain(drafts.vektor);
  });

  it('explicitly forbids averaging and demands single round', () => {
    const out = buildCrosstalkPrompt({
      character: 'anima',
      userMessage: 'q?',
      ownDraft: 'a',
      otherDrafts: [{ character: 'luca', content: 'b' }],
    });
    expect(out).toContain("don't average");
    expect(out).toContain('One round only');
    expect(out).toContain("Stay in your voice");
  });

  it('handles 2-of-3 graceful path (one other draft)', () => {
    const out = buildCrosstalkPrompt({
      character: 'luca',
      userMessage: 'q?',
      ownDraft: 'mine',
      otherDrafts: [{ character: 'anima', content: 'theirs' }],
    });
    expect(out).toContain('--- Anima ---');
    expect(out).not.toContain('--- Vektor ---');
  });

  it('includes tool context ground-truth block when provided', () => {
    const out = buildCrosstalkPrompt({
      character: 'vektor',
      userMessage: 'q?',
      ownDraft: 'mine',
      otherDrafts: [],
      toolContext: 'WHAT ACTUALLY HAPPENED THIS TURN: dispatched subagent.',
    });
    expect(out).toContain('WHAT ACTUALLY HAPPENED THIS TURN');
  });
});

describe('buildChairmanCouncilPrompt', () => {
  const drafts = [
    { character: 'luca' as const, content: 'luca says' },
    { character: 'anima' as const, content: 'anima says' },
    { character: 'vektor' as const, content: 'vektor says' },
  ];

  it('produces system + user content; system enforces verdict tag', () => {
    const out = buildChairmanCouncilPrompt({
      userMessage: 'what should I do?',
      drafts,
      refusalEnabled: true,
    });
    expect(out.system).toContain('You are Luca');
    expect(out.system).toContain('<verdict>synthesize</verdict>');
    expect(out.system).toContain('<verdict>diverge</verdict>');
    expect(out.user).toContain('"what should I do?"');
    expect(out.user).toContain('--- Luca ---');
    expect(out.user).toContain('--- Anima ---');
    expect(out.user).toContain('--- Vektor ---');
    expect(out.user).toContain('Start with the verdict tag');
  });

  it('with refusal disabled, locks the system to synthesize verdict only', () => {
    const out = buildChairmanCouncilPrompt({
      userMessage: 'q',
      drafts,
      refusalEnabled: false,
    });
    expect(out.system).toContain('Divergence-allowed mode is off');
    expect(out.system).toContain('<verdict>synthesize</verdict>');
    // The user-facing instruction still says "verdict tag" — system pins to synthesize.
    expect(out.system).not.toMatch(/\bdiverge\b.*\bdiverge\b/s); // diverge not over-emphasized
  });

  it('forbids the chairman from referencing the deliberation by name', () => {
    const out = buildChairmanCouncilPrompt({
      userMessage: 'q',
      drafts,
      refusalEnabled: true,
    });
    expect(out.system).toContain("Don't reference the council");
  });
});

describe('parseVerdictTag', () => {
  it('parses synthesize verdict and returns rest content stripped', () => {
    const { verdict, rest } = parseVerdictTag('<verdict>synthesize</verdict>\n\nhey. i hear you.');
    expect(verdict).toBe('synthesize');
    expect(rest).toBe('hey. i hear you.');
  });

  it('parses diverge verdict', () => {
    const { verdict, rest } = parseVerdictTag('<verdict>diverge</verdict>\n\nthe three of us see this differently.');
    expect(verdict).toBe('diverge');
    expect(rest).toBe('the three of us see this differently.');
  });

  it('handles whitespace inside the tag', () => {
    const { verdict } = parseVerdictTag('<verdict>  diverge  </verdict>\nbody');
    expect(verdict).toBe('diverge');
  });

  it('handles uppercase tag value', () => {
    const { verdict } = parseVerdictTag('<verdict>SYNTHESIZE</verdict>\nbody');
    expect(verdict).toBe('synthesize');
  });

  it('falls back to synthesize when tag is missing entirely', () => {
    const { verdict, rest } = parseVerdictTag('hey. i hear you.');
    expect(verdict).toBe('synthesize');
    expect(rest).toBe('hey. i hear you.');
  });

  it('falls back to synthesize on empty input', () => {
    const { verdict, rest } = parseVerdictTag('');
    expect(verdict).toBe('synthesize');
    expect(rest).toBe('');
  });

  it('handles malformed (closing-only) tag gracefully', () => {
    const { verdict, rest } = parseVerdictTag('</verdict>only\nhello');
    expect(verdict).toBe('synthesize');
    expect(rest).toBe('</verdict>only\nhello');
  });

  it('strips leading newlines after the verdict tag', () => {
    const { rest } = parseVerdictTag('<verdict>synthesize</verdict>\n\n\n\nbody');
    expect(rest.startsWith('body')).toBe(true);
  });

  it('handles preceding text by stripping just the tag (best-effort)', () => {
    const { verdict, rest } = parseVerdictTag('preface <verdict>diverge</verdict>\nbody');
    expect(verdict).toBe('diverge');
    expect(rest).toContain('preface');
    expect(rest).toContain('body');
    expect(rest).not.toContain('<verdict>');
  });
});

describe('buildCritiquePrompt', () => {
  const drafts = [
    { character: 'luca' as const, content: 'luca: hey. i hear you.' },
    { character: 'anima' as const, content: 'anima: that question circles itself.' },
    { character: 'vektor' as const, content: 'vektor: ship it.' },
  ];

  it('embeds all three SOULs (truncated) and the synthesis', () => {
    const out = buildCritiquePrompt({
      synthesized: 'final synthesized reply.',
      drafts,
      lucaSoul: LUCA_SOUL,
      animaSoul: ANIMA_SOUL,
      vektorSoul: VEKTOR_SOUL,
    });
    expect(out).toContain('LUCA SOUL:');
    expect(out).toContain('ANIMA SOUL:');
    expect(out).toContain('VEKTOR SOUL:');
    expect(out).toContain('You are Luca.');
    expect(out).toContain('You are Anima.');
    expect(out).toContain('You are Vektor.');
    expect(out).toContain('final synthesized reply.');
  });

  it('demands strict JSON shape', () => {
    const out = buildCritiquePrompt({
      synthesized: 'x',
      drafts,
      lucaSoul: 'A',
      animaSoul: 'B',
      vektorSoul: 'C',
    });
    expect(out).toContain('STRICT JSON');
    expect(out).toContain('"voice_drift_detected"');
    expect(out).toContain('"confidence"');
    expect(out).toContain('"suggested_revision"');
  });

  it('explicitly scopes the critic to voice fidelity only', () => {
    const out = buildCritiquePrompt({
      synthesized: 'x',
      drafts,
      lucaSoul: 'A',
      animaSoul: 'B',
      vektorSoul: 'C',
    });
    expect(out).toContain('NOT critiquing helpfulness');
    expect(out).toContain('ONLY voice fidelity');
  });
});

describe('parseVoiceCritique', () => {
  it('parses clean JSON', () => {
    const result = parseVoiceCritique(
      '{"voice_drift_detected": false, "confidence": 0.9, "critique": "preserved", "suggested_revision": null}',
    );
    expect(result).toEqual({
      voice_drift_detected: false,
      confidence: 0.9,
      critique: 'preserved',
      suggested_revision: null,
    });
  });

  it('parses JSON with markdown fences', () => {
    const result = parseVoiceCritique(
      '```json\n{"voice_drift_detected": true, "confidence": 0.8, "critique": "drift", "suggested_revision": "fix"}\n```',
    );
    expect(result?.voice_drift_detected).toBe(true);
    expect(result?.confidence).toBe(0.8);
  });

  it('parses JSON when model prefaces with prose', () => {
    const result = parseVoiceCritique(
      'Here is my judgment: {"voice_drift_detected": true, "confidence": 0.75, "critique": "drift in close", "suggested_revision": "shorten the close"}',
    );
    expect(result?.voice_drift_detected).toBe(true);
    expect(result?.suggested_revision).toBe('shorten the close');
  });

  it('clamps confidence to [0,1]', () => {
    expect(parseVoiceCritique('{"voice_drift_detected":true,"confidence":1.5,"critique":"x","suggested_revision":null}')?.confidence).toBe(1);
    expect(parseVoiceCritique('{"voice_drift_detected":true,"confidence":-0.2,"critique":"x","suggested_revision":null}')?.confidence).toBe(0);
  });

  it('returns null on garbage input', () => {
    expect(parseVoiceCritique('')).toBeNull();
    expect(parseVoiceCritique('not json at all')).toBeNull();
    expect(parseVoiceCritique('{ broken')).toBeNull();
  });
});

describe('buildDivergeBody', () => {
  const drafts = [
    { character: 'luca' as const, content: 'luca: care for yourself first.' },
    { character: 'anima' as const, content: 'anima: the question circles itself.' },
    { character: 'vektor' as const, content: 'vektor: ship it.' },
  ];

  it('renders framing on top + each draft below with character heading', () => {
    const body = buildDivergeBody({
      framing: 'these three would actually disagree.',
      drafts,
    });
    expect(body).toContain('these three would actually disagree.');
    expect(body).toContain('**Luca**');
    expect(body).toContain('**Anima**');
    expect(body).toContain('**Vektor**');
    expect(body).toContain('luca: care for yourself first.');
    expect(body).toContain('anima: the question circles itself.');
    expect(body).toContain('vektor: ship it.');
  });

  it('falls back to a default framing when chairman emitted nothing after the tag', () => {
    const body = buildDivergeBody({ framing: '', drafts });
    expect(body).toContain('the three of us see this differently');
  });
});

describe('CHARACTER_LABELS sanity', () => {
  it('has the three expected characters', () => {
    expect(Object.keys(CHARACTER_LABELS).sort()).toEqual(['anima', 'luca', 'vektor']);
    expect(CHARACTER_LABELS.luca).toBe('Luca');
    expect(CHARACTER_LABELS.anima).toBe('Anima');
    expect(CHARACTER_LABELS.vektor).toBe('Vektor');
  });
});
