import { describe, expect, it } from 'vitest';
import { getChatModelLabel, normalizeChatModelId } from '@/lib/chatRuntime';

describe('getChatModelLabel', () => {
  it('returns labels for newly registered Claude Opus models', () => {
    expect(getChatModelLabel('anthropic/claude-opus-4.8')).toBe('Claude Opus 4.8');
    expect(getChatModelLabel('anthropic/claude-opus-4.5')).toBe('Claude Opus 4.5');
    expect(getChatModelLabel('anthropic/claude-opus-4.1')).toBe('Claude Opus 4.1');
  });

  it('normalizes canonical OpenRouter Claude Opus slugs', () => {
    expect(normalizeChatModelId('anthropic/claude-4.8-opus-20260528')).toBe('anthropic/claude-opus-4.8');
    expect(normalizeChatModelId('anthropic/claude-4.5-opus-20251124')).toBe('anthropic/claude-opus-4.5');
    expect(normalizeChatModelId('anthropic/claude-4.1-opus-20250805')).toBe('anthropic/claude-opus-4.1');
    expect(getChatModelLabel('anthropic/claude-4.8-opus-20260528')).toBe('Claude Opus 4.8');
  });

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
