import { describe, expect, it } from 'vitest';
import { buildLucaSystemPrompt } from '../../supabase/functions/_shared/agents/luca-soul';

describe('buildLucaSystemPrompt identity layers', () => {
  it('layers living identity docs after the locked soul and before runtime state', () => {
    const prompt = buildLucaSystemPrompt({
      soulMd: '## What I value\nTruth before polish.',
      userModel: 'Prefers direct, concrete critique.',
      selfModel: 'Sometimes over-compresses too early.',
      emotionalBlock: 'Current emotional state: steady.',
      beliefsBlock: 'Beliefs: craft matters.',
      memoryContext: 'Relevant memories about this person: ships fast.',
      continuityNote: 'Pick up gently.',
    });

    const soulIndex = prompt.indexOf('You are Luca.');
    const soulMdIndex = prompt.indexOf("## How you've come to think about yourself");
    const userModelIndex = prompt.indexOf("## Who you're talking with");
    const selfModelIndex = prompt.indexOf("## How you've been showing up");
    const stateIndex = prompt.indexOf('Current emotional state: steady.');

    expect(soulIndex).toBeGreaterThanOrEqual(0);
    expect(soulIndex).toBeLessThan(soulMdIndex);
    expect(soulMdIndex).toBeLessThan(userModelIndex);
    expect(userModelIndex).toBeLessThan(selfModelIndex);
    expect(selfModelIndex).toBeLessThan(stateIndex);
    expect(prompt).toContain('Truth before polish.');
    expect(prompt).toContain('Prefers direct, concrete critique.');
    expect(prompt).toContain('Sometimes over-compresses too early.');
  });
});
