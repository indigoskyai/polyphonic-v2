import { describe, expect, it } from 'vitest';
import { parseThinkingContent, peekContent } from '@/components/messages/ThinkingBlock';

describe('ThinkingBlock parsing', () => {
  it('separates agent activity traces from normal reasoning sections', () => {
    const segments = parseThinkingContent([
      'initial reasoning',
      '',
      '— Agent activity —',
      'Preparing agent mode.',
      'Searching the web for current context.',
      'web search finished: compact result',
      '',
      '— Luca —',
      'final private thought',
    ].join('\n'));

    expect(segments).toEqual([
      { kind: 'text', text: 'initial reasoning' },
      {
        kind: 'activity',
        title: 'Agent activity',
        lines: [
          'Preparing agent mode.',
          'Searching the web for current context.',
          'web search finished: compact result',
        ],
      },
      { kind: 'section', title: 'Luca', text: 'final private thought' },
    ]);
  });

  it('peeks at the latest useful activity or thought lines', () => {
    expect(peekContent('— Agent activity —\nPreparing agent mode.\nChecking Luca continuity and memory context.'))
      .toBe('Preparing agent mode.\nChecking Luca continuity and memory context.');

    expect(peekContent('line one\nline two\nline three')).toBe('line two\nline three');
  });
});
