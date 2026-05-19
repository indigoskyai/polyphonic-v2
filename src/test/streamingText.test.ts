import { describe, expect, it } from 'vitest';
import { appendStreamingDelta } from '@/lib/streamingText';

describe('appendStreamingDelta', () => {
  it('keeps reasoning chunks in flowing prose instead of forcing word ladders', () => {
    const chunks = ['The', ' user', ' is', ' greeting', ' me', ' and', ' expressing', ' frustration.'];
    const text = chunks.reduce((acc, chunk) => appendStreamingDelta(acc, chunk), '');

    expect(text).toBe('The user is greeting me and expressing frustration.');
    expect(text).not.toContain('\n\n user');
  });

  it('trims leading whitespace from the first streamed chunk only', () => {
    expect(appendStreamingDelta('', '  The room opens.')).toBe('The room opens.');
    expect(appendStreamingDelta('The room', ' opens.')).toBe('The room opens.');
  });
});
