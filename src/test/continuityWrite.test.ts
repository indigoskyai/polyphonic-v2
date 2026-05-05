import { describe, expect, it } from 'vitest';
import {
  buildHypomnemaGatePayload,
  queueContinuityTurnWrites,
  type ContinuityWriteDeps,
} from '../../supabase/functions/_shared/continuity/write';

const supabaseStub = {} as any;

describe('Continuity Kernel write path', () => {
  it('builds one hypomnema gate payload with primary and observer provenance', () => {
    const payload = buildHypomnemaGatePayload({
      supabase: supabaseStub,
      userId: 'u1',
      threadId: 't1',
      agentId: 'luca',
      userMessage: 'this mattered',
      agentResponse: 'i am carrying it.',
      sourceMessageId: 'assistant-1',
      recentTurns: [
        { role: 'system', content: 'hidden' },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
      observers: [
        { agentId: 'anima', contribution: 'anima saw the identity angle.' },
        { agentId: 'luca', contribution: 'same agent is ignored.' },
      ],
    });

    expect(payload.recent_turns).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ]);
    expect(payload.chain_write).toEqual([
      expect.objectContaining({
        agent_id: 'luca',
        source_message_id: 'assistant-1',
        density: 'primary',
      }),
      expect.objectContaining({
        agent_id: 'anima',
        source_message_id: 'assistant-1',
        density: 'observer',
        primary_agent_name: 'luca',
        your_contribution: 'anima saw the identity angle.',
      }),
    ]);
  });

  it('queues all post-turn memory operations through the same reportable path', () => {
    const fetchCalls: Array<{ url: string; body: any; auth: string }> = [];
    const finalized: string[] = [];
    const encoded: string[] = [];
    const metadata: string[][] = [];

    const deps: ContinuityWriteDeps = {
      env: (name) => {
        if (name === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role';
        return undefined;
      },
      fetch: async (url, init) => {
        fetchCalls.push({
          url: String(url),
          body: JSON.parse(String(init?.body || '{}')),
          auth: String((init?.headers as Record<string, string>)?.Authorization || ''),
        });
        return new Response('{}', { status: 200 });
      },
      finalizePendingRevisions: async (_supabase, _apiKey, revisions) => {
        finalized.push(...revisions.map((r) => r.id));
      },
      encodeMnemosExchange: async (_supabase, _userId, userMessage) => {
        encoded.push(userMessage);
      },
      updateThreadAgentMetadata: async (_supabase, _threadId, primary, participants) => {
        metadata.push([primary, ...participants]);
      },
      log: () => {},
      warn: () => {},
    };

    const report = queueContinuityTurnWrites({
      supabase: supabaseStub,
      userId: 'u1',
      threadId: 't1',
      agentId: 'luca',
      userMessage: 'remember this',
      agentResponse: 'i will.',
      sourceMessageId: 'a1',
      apiKey: 'openrouter-key',
      authHeader: 'Bearer user-jwt',
      pendingRevisions: [{
        id: 'rev1',
        revision_type: 'correction',
        what_was_said: 'x',
        what_to_say_now: 'y',
        rationale: null,
        created_at: '2026-05-05T00:00:00.000Z',
      }],
      recentTurns: [{ role: 'user', content: 'remember this' }],
      observers: [{ agentId: 'anima', contribution: 'anima contribution' }],
    }, deps);

    expect(report.operations.every((op) => op.status === 'queued')).toBe(true);
    expect(finalized).toEqual(['rev1']);
    expect(encoded).toEqual(['remember this']);
    expect(metadata[0]).toEqual(['luca', 'luca', 'anima']);
    expect(fetchCalls.map((c) => c.url)).toEqual([
      'https://example.supabase.co/functions/v1/observer-watch',
      'https://example.supabase.co/functions/v1/mnemos-dialectic',
      'https://example.supabase.co/functions/v1/skills-distill',
      'https://example.supabase.co/functions/v1/hypomnema-gate',
    ]);
    expect(fetchCalls.at(-1)?.auth).toBe('Bearer service-role');
    expect(fetchCalls.at(-1)?.body.chain_write).toHaveLength(2);
  });

  it('makes skipped write work explicit when auth or service env is unavailable', () => {
    const report = queueContinuityTurnWrites({
      supabase: supabaseStub,
      userId: 'u1',
      threadId: 't1',
      agentId: 'luca',
      userMessage: 'remember this',
      agentResponse: 'i will.',
      pendingRevisions: [],
    }, {
      env: () => undefined,
      encodeMnemosExchange: async () => {},
      updateThreadAgentMetadata: async () => {},
      log: () => {},
      warn: () => {},
    });

    expect(report.operations).toContainEqual(expect.objectContaining({
      name: 'pending_revisions',
      status: 'skipped',
      reason: 'no pending revisions',
    }));
    expect(report.operations).toContainEqual(expect.objectContaining({
      name: 'observer_watch',
      status: 'skipped',
      reason: 'no auth header',
    }));
    expect(report.operations).toContainEqual(expect.objectContaining({
      name: 'hypomnema_gate',
      status: 'skipped',
      reason: 'no service role',
    }));
  });
});
