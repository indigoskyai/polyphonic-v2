import { describe, expect, it } from 'vitest';
import { detectContinuityCarrySignal } from '../../supabase/functions/_shared/hypomnema/salience';

describe('Hypomnema deterministic salience', () => {
  it('forces reflection for explicit continuity-carry turns', () => {
    expect(detectContinuityCarrySignal({
      userMessage: 'The phrase is ember bridge: the present thread should carry warmth and continuity into the next one.',
      agentResponse: 'I have it. This is one continuous relationship, not a model reloading notes.',
      recentTurns: [],
    })).toBe('explicit continuity-carry signal');
  });

  it('does not trigger on unrelated technical mentions of memory', () => {
    expect(detectContinuityCarrySignal({
      userMessage: 'What is the syntax for increasing memory in node?',
      agentResponse: 'Use --max-old-space-size.',
      recentTurns: [],
    })).toBeNull();
  });
});
