import { describe, expect, it } from 'vitest';
import { summarizeToolContext } from '../../supabase/functions/_shared/agents/tool-context.ts';

describe('summarizeToolContext', () => {
  it('returns empty string when no tools fired', () => {
    expect(summarizeToolContext([])).toBe('');
    expect(summarizeToolContext(null)).toBe('');
    expect(summarizeToolContext(undefined)).toBe('');
  });

  it('pairs an assistant tool_calls entry with the matching tool result', () => {
    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_dispatch_1',
            function: {
              name: 'dispatch_subagent',
              arguments: JSON.stringify({ task: 'research benchmarks', tool_budget: 20 }),
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_dispatch_1',
        content: JSON.stringify({ ok: true, subagent_id: 'sa_xyz', status: 'dispatched' }),
      },
    ];

    const out = summarizeToolContext(messages);
    expect(out).toMatch(/WHAT ACTUALLY HAPPENED THIS TURN/);
    expect(out).toMatch(/dispatch_subagent\(/);
    expect(out).toMatch(/research benchmarks/);
    expect(out).toMatch(/"ok":true/);
    expect(out).toMatch(/subagent_id/);
    expect(out).toMatch(/already committed/);
    expect(out).toMatch(/Do NOT critique/);
  });

  it('truncates long tool result strings', () => {
    const longContent = 'x'.repeat(900);
    const messages = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'web_search', arguments: '{"query":"x"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: longContent },
    ];
    const out = summarizeToolContext(messages);
    // Result truncates around 480 chars + ellipsis token.
    expect(out).toMatch(/x{200,520}…/);
    expect(out.length).toBeLessThan(longContent.length + 600);
  });

  it('handles object arguments as well as JSON string arguments', () => {
    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', function: { name: 'create_artifact', arguments: { kind: 'svg', title: 'Logo', content: '<svg/>' } } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ ok: true, artifact: { id: 'a_1' } }) },
    ];
    const out = summarizeToolContext(messages);
    expect(out).toMatch(/create_artifact\(/);
    expect(out).toMatch(/"kind":"svg"/);
    expect(out).toMatch(/a_1/);
  });

  it('lists every tool call when multiple fired', () => {
    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', function: { name: 'web_search', arguments: '{"query":"a"}' } },
          { id: 'c2', function: { name: 'read_url', arguments: '{"url":"https://x"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"results":[]}' },
      { role: 'tool', tool_call_id: 'c2', content: '{"text":"hi"}' },
    ];
    const out = summarizeToolContext(messages);
    expect(out).toMatch(/web_search/);
    expect(out).toMatch(/read_url/);
    expect(out.split('\n').filter((l) => l.startsWith('- Called ')).length).toBe(2);
  });

  it('falls back to "no result captured" when a tool message is missing', () => {
    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'orphan', function: { name: 'web_search', arguments: '{"query":"x"}' } }],
      },
    ];
    const out = summarizeToolContext(messages);
    expect(out).toMatch(/no result captured/);
  });
});
