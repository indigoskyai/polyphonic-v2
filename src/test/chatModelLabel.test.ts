import { describe, expect, it } from 'vitest';
import { getChatModelLabel, normalizeChatModelId } from '@/lib/chatRuntime';

describe('getChatModelLabel', () => {
  it('returns the canonical label for the registered Claude Opus 4.7 id', () => {
    expect(getChatModelLabel('anthropic/claude-opus-4-7')).toBe('Claude Opus 4.7');
  });

  it('normalizes alternative Claude Opus 4.7 aliases', () => {
    expect(getChatModelLabel('anthropic/claude-opus-4.7')).toBe('Claude Opus 4.7');
    expect(getChatModelLabel('anthropic/claude-4.7-opus-20260416')).toBe('Claude Opus 4.7');
    expect(normalizeChatModelId('anthropic/claude-4.7-opus-20260416')).toBe('anthropic/claude-opus-4-7');
  });

  it('falls back to the trailing slug when the id is unknown', () => {
    expect(getChatModelLabel('some-provider/unknown-model')).toBe('unknown-model');
  });
});
