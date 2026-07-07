import { describe, expect, it } from 'vitest';
import {
  isSameVisibleAssistantAgent,
  normalizeStreamComparableContent,
  shouldHideStreamingMirrorMessage,
} from '@/lib/streamingMirror';

const now = new Date('2026-07-07T12:00:00.000Z').getTime();

const assistantMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'assistant-1',
  role: 'assistant',
  agent: 'luca',
  content: 'The saved answer.',
  created_at: new Date(now - 1000).toISOString(),
  metadata: null,
  ...overrides,
});

describe('streaming mirror helpers', () => {
  it('normalizes stream content for final-row comparison', () => {
    expect(normalizeStreamComparableContent('  hello\n\nLuca   ')).toBe('hello Luca');
  });

  it('treats classic Luca and agent Luca as the same visible assistant', () => {
    expect(isSameVisibleAssistantAgent('luca', null)).toBe(true);
    expect(isSameVisibleAssistantAgent(null, 'luca')).toBe(true);
    expect(isSameVisibleAssistantAgent('anima', 'luca')).toBe(false);
  });

  it('hides a saved Luca row during a classic-mode stream mirror', () => {
    expect(shouldHideStreamingMirrorMessage({
      message: assistantMessage({ agent: 'luca' }),
      isLast: false,
      isStreaming: false,
      lingeringStream: 'The saved answer.',
      activeStreamNorm: normalizeStreamComparableContent('The saved answer.'),
      activeMessageAgent: null,
      now,
    })).toBe(true);
  });

  it('hides the completed message id even when persisted content has metadata-driven differences', () => {
    expect(shouldHideStreamingMirrorMessage({
      message: assistantMessage({ id: 'db-final', content: 'The saved answer with citations.' }),
      isLast: false,
      isStreaming: false,
      lingeringStream: 'The saved answer.',
      activeStreamNorm: normalizeStreamComparableContent('The saved answer.'),
      activeMessageAgent: 'luca',
      completedStreamMessageId: 'db-final',
      now,
    })).toBe(true);
  });

  it('does not hide stale or different-agent messages', () => {
    expect(shouldHideStreamingMirrorMessage({
      message: assistantMessage({ created_at: new Date(now - 90_000).toISOString() }),
      isLast: true,
      isStreaming: true,
      lingeringStream: null,
      activeStreamNorm: '',
      activeMessageAgent: 'luca',
      now,
    })).toBe(false);

    expect(shouldHideStreamingMirrorMessage({
      message: assistantMessage({ agent: 'anima' }),
      isLast: true,
      isStreaming: true,
      lingeringStream: null,
      activeStreamNorm: '',
      activeMessageAgent: 'luca',
      now,
    })).toBe(false);
  });
});
