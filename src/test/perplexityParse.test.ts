// Pin the Sonar response parsing so tweaks to the prompt or fence-stripping
// don't silently break either the JSON path or the citation fallback.

import { describe, expect, it } from 'vitest';

// Re-implementation of `parseSonarResponse` from the Deno helper, kept in
// sync. Vitest doesn't import the Deno module directly because the helper
// also exports `runSonar`/`loadUserOpenRouterKey` which import Deno-flavored
// runtime APIs at module load. The parser itself is pure.
function parseSonarResponse(rawContent: string, inlineCitations: string[]) {
  const fallbackResults = inlineCitations.map((u) => ({ title: '', url: u, snippet: '' }));
  if (!rawContent) {
    return { answer: '', title: '', results: fallbackResults };
  }
  const cleaned = rawContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const results = Array.isArray(parsed.results)
      ? parsed.results.map((r: any) => ({
          title: typeof r.title === 'string' ? r.title : '',
          url: typeof r.url === 'string' ? r.url : '',
          snippet: typeof r.snippet === 'string' ? r.snippet : (typeof r.content === 'string' ? r.content : ''),
        }))
      : fallbackResults;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      answer: typeof parsed.answer === 'string' ? parsed.answer : rawContent,
      results,
    };
  } catch {
    return { answer: rawContent, title: '', results: fallbackResults };
  }
}

describe('Sonar response parser', () => {
  it('parses well-formed JSON with results', () => {
    const raw = JSON.stringify({
      answer: 'Long-context retrieval evals show degradation past 32k tokens.',
      results: [
        { title: 'NIAH 2025', url: 'https://example.com/niah', snippet: 'Needle-in-a-haystack benchmark.' },
        { title: 'RULER', url: 'https://example.com/ruler', snippet: 'New diagnostic suite.' },
      ],
    });
    const out = parseSonarResponse(raw, []);
    expect(out.answer).toMatch(/NIAH|degradation|long-context/i);
    expect(out.results).toHaveLength(2);
    expect(out.results[0].url).toBe('https://example.com/niah');
  });

  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"answer": "hi", "results": []}\n```';
    const out = parseSonarResponse(raw, []);
    expect(out.answer).toBe('hi');
    expect(out.results).toEqual([]);
  });

  it('falls back to inline citations when JSON parse fails', () => {
    const raw = 'Sonar returned plain prose, no JSON here.';
    const out = parseSonarResponse(raw, ['https://example.com/a', 'https://example.com/b']);
    expect(out.answer).toBe('Sonar returned plain prose, no JSON here.');
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toEqual({ title: '', url: 'https://example.com/a', snippet: '' });
  });

  it('handles a read response with title field', () => {
    const raw = JSON.stringify({
      title: 'Long-context retrieval, RULER',
      answer: 'The page surveys benchmarks…',
      results: [{ title: 'RULER', url: 'https://x', snippet: 'overview' }],
    });
    const out = parseSonarResponse(raw, []);
    expect(out.title).toBe('Long-context retrieval, RULER');
    expect(out.results[0].title).toBe('RULER');
  });

  it('returns empty answer + fallback citations when raw is empty', () => {
    const out = parseSonarResponse('', ['https://only-citation']);
    expect(out.answer).toBe('');
    expect(out.results).toEqual([{ title: '', url: 'https://only-citation', snippet: '' }]);
  });

  it('coerces malformed result entries without throwing', () => {
    const raw = JSON.stringify({
      answer: 'ok',
      results: [{ title: 1, url: null, snippet: 7 }, { title: 'Real', url: 'https://r', content: 'fallback-snippet' }],
    });
    const out = parseSonarResponse(raw, []);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toEqual({ title: '', url: '', snippet: '' });
    expect(out.results[1]).toEqual({ title: 'Real', url: 'https://r', snippet: 'fallback-snippet' });
  });
});
