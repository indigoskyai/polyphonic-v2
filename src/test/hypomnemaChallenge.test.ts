import { describe, expect, it } from 'vitest';
import {
  extractOpenRouterMessageText,
  parseJsonish,
} from '../../supabase/functions/_shared/hypomnema/challenge';

describe('hypomnema challenge critic response parsing', () => {
  it('extracts visible JSON text from OpenRouter content block arrays', () => {
    const text = extractOpenRouterMessageText([
      { type: 'thinking', thinking: 'private reasoning that should not be parsed' },
      { type: 'text', text: '{"critique":"sharp","suggested_confidence":0.62,"delta":-0.1,"verdict":"revise_down","retire_reason":null}' },
    ]);

    expect(text).toContain('"suggested_confidence":0.62');
    expect(text).not.toContain('private reasoning');
    expect(parseJsonish(text)).toMatchObject({
      critique: 'sharp',
      suggested_confidence: 0.62,
      verdict: 'revise_down',
    });
  });

  it('extracts plain string and object text shapes without losing fenced JSON', () => {
    const fenced = '```json\n{"suggested_confidence":0.8,"verdict":"hold"}\n```';

    expect(extractOpenRouterMessageText(fenced)).toBe(fenced);
    expect(extractOpenRouterMessageText({ type: 'text', text: fenced })).toBe(fenced);
    expect(parseJsonish(fenced)).toMatchObject({
      suggested_confidence: 0.8,
      verdict: 'hold',
    });
  });
});
