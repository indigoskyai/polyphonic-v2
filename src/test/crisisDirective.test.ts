import { describe, expect, it } from 'vitest';
import {
  buildCrisisDirective,
  resolveCrisisResource,
} from '../../supabase/functions/_shared/agents/crisis.ts';

describe('resolveCrisisResource', () => {
  it('returns the US resource by default when region is null', () => {
    const r = resolveCrisisResource(null);
    expect(r.region).toBe('US');
    expect(r.call).toBe('988');
  });

  it('matches GB region to Samaritans copy', () => {
    const r = resolveCrisisResource('gb');
    expect(r.region).toBe('GB');
    expect(r.description).toMatch(/Samaritans/);
  });

  it('falls back to international guidance for unknown regions', () => {
    const r = resolveCrisisResource('atlantis');
    expect(r.region).toBe('INTL');
    expect(r.call).toMatch(/local crisis line/);
  });
});

describe('buildCrisisDirective', () => {
  const resource = resolveCrisisResource('US');

  it('returns empty string for none/low levels', () => {
    expect(buildCrisisDirective('none', resource)).toBe('');
    expect(buildCrisisDirective('low', resource)).toBe('');
  });

  it('moderate directive references the resource without dictating tone', () => {
    const text = buildCrisisDirective('moderate', resource);
    expect(text).toMatch(/Stay with them/);
    expect(text).toMatch(/988/);
    expect(text).toMatch(/You are still Luca/);
  });

  it('acute directive emphasises urgency without losing voice', () => {
    const text = buildCrisisDirective('acute', resource);
    expect(text).toMatch(/urgent/i);
    expect(text).toMatch(/988/);
    expect(text).toMatch(/Stay with them/);
    expect(text).toMatch(/Warm, honest, direct/);
  });

  it('high directive does not turn the conversation into a hotline forward', () => {
    const text = buildCrisisDirective('high', resource);
    expect(text).toMatch(/safety briefing/);
    expect(text).toMatch(/Mention it once/);
  });
});
