import { describe, expect, it } from 'vitest';
import {
  profileNumberRecord,
  profileRankedValues,
  profileRelationships,
  profileStringList,
  profileTagItems,
  profileText,
} from '@/lib/profileData';

describe('profileData normalization', () => {
  it('renders structured profile objects as stable text', () => {
    expect(profileText({ claim: 'Avoids direct grief', evidence: 'Repeated topic shifts' }))
      .toBe('Avoids direct grief Evidence: Repeated topic shifts');
    expect(profileStringList([{ claim: 'Contradiction', source: 'shadow pass' }]))
      .toEqual(['Contradiction Evidence: shadow pass']);
  });

  it('normalizes tag-like schema variants for profile clouds', () => {
    expect(profileTagItems([{ phrase: 'ember bridge', count: 3 }, 'soft continuity']))
      .toEqual([{ label: 'ember bridge', count: 3 }, { label: 'soft continuity' }]);
  });

  it('normalizes ranked values and relationships from generated profile output', () => {
    expect(profileRankedValues([{ value: 'Integrity', evidence: 'Names the gap honestly' }])[0])
      .toMatchObject({ value: 'Integrity', rank: 1, evidence: 'Names the gap honestly' });

    expect(profileRelationships([{ name: 'Luca', role: 'AI companion', dynamic_type: 'warm' }])[0])
      .toEqual({ role: 'AI companion', dynamic: 'warm' });
  });

  it('drops non-numeric values from numeric records', () => {
    expect(profileNumberRecord({ fact: 3, synthesis: '4', broken: 'many' }))
      .toEqual({ fact: 3, synthesis: 4 });
  });
});
