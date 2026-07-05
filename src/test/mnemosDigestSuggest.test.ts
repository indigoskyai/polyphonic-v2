import { describe, expect, it } from 'vitest';
import {
  normalizeDigestSuggestions,
  parseDigestSuggestionPayload,
} from '../../supabase/functions/_shared/mnemos/digest-suggestions';

describe('mnemos digest suggestion parsing', () => {
  it('accepts plain JSON model responses', () => {
    const parsed = parseDigestSuggestionPayload('{"suggestions":[{"id":"e1","action":"keep","confidence":0.8,"reason":"durable"}]}');
    expect(parsed.suggestions).toHaveLength(1);
  });

  it('accepts fenced JSON model responses', () => {
    const suggestions = normalizeDigestSuggestions(`\`\`\`json
{
  "suggestions": [
    { "id": "e1", "action": "distill", "confidence": 0.72, "reason": "valuable but raw" }
  ]
}
\`\`\``);

    expect(suggestions).toEqual([
      {
        id: 'e1',
        action: 'distill',
        confidence: 0.72,
        reason: 'valuable but raw',
      },
    ]);
  });

  it('extracts JSON when a model adds prose around it', () => {
    const suggestions = normalizeDigestSuggestions(`Here is the JSON:

\`\`\`json
{"suggestions":[{"id":"e2","action":"release","confidence":0.4,"reason":"low signal"}]}
\`\`\``);

    expect(suggestions[0]).toMatchObject({
      id: 'e2',
      action: 'release',
      confidence: 0.4,
    });
  });

  it('fails clearly when no JSON object is present', () => {
    expect(() => parseDigestSuggestionPayload('no structured payload')).toThrow(/valid JSON object/);
  });
});
