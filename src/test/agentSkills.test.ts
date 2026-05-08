import { describe, expect, it } from 'vitest';
import {
  deriveTriggerKeywords,
  formatAgentSkillsPrompt,
  normalizeSkillName,
  scoreAgentSkill,
} from '../../supabase/functions/_shared/agents/skills';

describe('agent skill helpers', () => {
  it('normalizes skill names into durable kebab-case identifiers', () => {
    expect(normalizeSkillName('Cold Outreach Drafting!')).toBe('cold-outreach-drafting');
  });

  it('matches skills by trigger keyword and description overlap', () => {
    const score = scoreAgentSkill({
      name: 'cold-outreach-drafting',
      description: 'Draft and refine concise cold outreach emails.',
      trigger_keywords: ['cold email', 'outreach'],
    }, 'I need to write a cold email for a founder');

    expect(score).toBeGreaterThanOrEqual(9);
  });

  it('formats loaded skills under concise procedural context', () => {
    const prompt = formatAgentSkillsPrompt([
      {
        id: 'skill-1',
        name: 'cold-outreach-drafting',
        description: 'Draft and refine concise cold outreach emails.',
        trigger_keywords: deriveTriggerKeywords('cold-outreach-drafting', 'Draft and refine concise cold outreach emails.'),
        content: '# Cold outreach drafting\n\n## Steps\n1. Start concrete.\n2. Cut vague praise.',
        score: 12,
      },
    ]);

    // Skills were reframed as the agent's self-model (see
    // supabase/functions/_shared/agents/skills.ts:143). Assertion follows
    // current wording.
    expect(prompt).toContain("procedural patterns you've formed");
    expect(prompt).toContain('### cold-outreach-drafting');
    expect(prompt).toContain('When to use: Draft and refine concise cold outreach emails.');
  });
});
