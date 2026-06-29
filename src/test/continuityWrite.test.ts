import { describe, expect, it } from 'vitest';
import {
  buildHypomnemaGatePayload,
  deriveMnemosExchangeEncodingContext,
  queueContinuityTurnWrites,
  stripCurrentTurnFromRecentTurns,
  type ContinuityWriteDeps,
} from '../../supabase/functions/_shared/continuity/write';

type SupabaseStub = Parameters<typeof buildHypomnemaGatePayload>[0]['supabase'];
type FetchCall = { url: string; body: Record<string, unknown>; auth: string };

const supabaseStub = {} as SupabaseStub;

function parseBody(value: unknown): Record<string, unknown> {
  return JSON.parse(String(value || '{}')) as Record<string, unknown>;
}

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

  it('removes only the live turn from hypomnema recent turns', () => {
    expect(stripCurrentTurnFromRecentTurns([
      { role: 'user', content: 'yes' },
      { role: 'assistant', content: 'previous reply' },
      { role: 'user', content: 'hello again' },
      { role: 'assistant', content: 'Hello. The records are open.' },
    ], 'hello again', 'Hello. The records are open.')).toEqual([
      { role: 'user', content: 'yes' },
      { role: 'assistant', content: 'previous reply' },
    ]);

    expect(stripCurrentTurnFromRecentTurns([
      { role: 'user', content: 'hello again' },
      { role: 'assistant', content: 'older matching response' },
      { role: 'user', content: 'hello again' },
    ], 'hello again', 'different current answer')).toEqual([
      { role: 'user', content: 'hello again' },
      { role: 'assistant', content: 'older matching response' },
    ]);
  });

  it('marks explicit continuity-carry turns for Mnemos without forcing ordinary chat', () => {
    const ordinary = deriveMnemosExchangeEncodingContext(
      'what should we make for dinner?',
      'something simple and warm.',
    );
    expect(ordinary.tags).toEqual(['conversation']);
    expect(ordinary.source_context).toEqual({ type: 'chat_exchange' });

    const continuity = deriveMnemosExchangeEncodingContext(
      'fresh thread. what are you carrying from the last session?',
      'i am carrying the ember bridge distinction without turning it into a retrieval report.',
      [{ role: 'assistant', content: 'we named the difference between integration and access.' }],
    );
    expect(continuity.tags).toEqual(expect.arrayContaining([
      'conversation',
      'continuity',
      'felt-continuity',
      'continuity-carry',
    ]));
    expect(continuity.source_context).toMatchObject({
      type: 'chat_exchange',
      continuity_carry_reason: expect.stringContaining('continuity'),
    });
  });

  it('queues all post-turn memory operations through the same reportable path', () => {
    const fetchCalls: FetchCall[] = [];
    const finalized: string[] = [];
	    const encoded: string[] = [];
    const metadata: string[][] = [];

    const deps: ContinuityWriteDeps = {
      env: (name) => {
        if (name === 'DIALECTIC_ENABLED') return 'true';
        if (name === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role';
        return undefined;
      },
      fetch: async (url, init) => {
        fetchCalls.push({
          url: String(url),
          body: parseBody(init?.body),
          auth: String((init?.headers as Record<string, string>)?.Authorization || ''),
        });
        return new Response('{}', { status: 200 });
      },
      finalizePendingRevisions: async (_supabase, _apiKey, revisions) => {
        finalized.push(...revisions.map((r) => r.id));
      },
	      encodeMnemosExchange: async (_supabase, _userId, agentId, userMessage) => {
	        encoded.push(`${agentId}:${userMessage}`);
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
	    expect(encoded).toEqual(['luca:remember this']);
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

	  it('keeps Classic Chat writes quiet except shared and model-family Mnemos encoding', () => {
	    const fetchCalls: FetchCall[] = [];
	    const encoded: string[] = [];
	    const metadata: string[][] = [];

	    const deps: ContinuityWriteDeps = {
	      env: (name) => {
	        if (name === 'DIALECTIC_ENABLED') return 'true';
	        if (name === 'SUPABASE_URL') return 'https://example.supabase.co';
	        if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role';
	        return undefined;
	      },
	      fetch: async (url, init) => {
	        fetchCalls.push({
	          url: String(url),
	          body: parseBody(init?.body),
	          auth: String((init?.headers as Record<string, string>)?.Authorization || ''),
	        });
	        return new Response('{}', { status: 200 });
	      },
	      finalizePendingRevisions: async () => {},
	      encodeMnemosExchange: async (_supabase, _userId, agentId, userMessage) => {
	        encoded.push(`${agentId}:${userMessage}`);
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
	      runtimeProfile: 'classic',
	      memoryAgentIds: ['classic:shared', 'classic:family:openai'],
	      userMessage: 'remember this quietly',
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
	    }, deps);

	    expect(encoded).toEqual([
	      'classic:shared:remember this quietly',
	      'classic:family:openai:remember this quietly',
	    ]);
	    expect(fetchCalls).toEqual([]);
	    expect(metadata).toEqual([]);
	    expect(report.operations).toContainEqual(expect.objectContaining({
	      name: 'mnemos_encode',
	      status: 'queued',
	    }));
	    for (const name of ['pending_revisions', 'observer_watch', 'mnemos_dialectic', 'skills_distill', 'hypomnema_gate', 'thread_agent_metadata']) {
	      expect(report.operations).toContainEqual(expect.objectContaining({
	        name,
	        status: 'skipped',
	        reason: 'classic quiet runtime',
	      }));
	    }
	  });

	  it('runs dialectic and identity work for custom agents, not just Luca', () => {
    const fetchCalls: Array<Omit<FetchCall, 'auth'>> = [];
    const deps: ContinuityWriteDeps = {
      env: (name) => {
        if (name === 'DIALECTIC_ENABLED') return 'true';
        if (name === 'SUPABASE_URL') return 'https://example.supabase.co';
        if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role';
        return undefined;
      },
      fetch: async (url, init) => {
        fetchCalls.push({
          url: String(url),
          body: parseBody(init?.body),
        });
        return new Response('{}', { status: 200 });
      },
      finalizePendingRevisions: async () => {},
      encodeMnemosExchange: async () => {},
      updateThreadAgentMetadata: async () => {},
      log: () => {},
      warn: () => {},
    };

    const report = queueContinuityTurnWrites({
      supabase: supabaseStub,
      userId: 'u1',
      threadId: 't1',
      agentId: 'quill',
      userMessage: 'remember this for quill',
      agentResponse: 'i will keep it as myself.',
      sourceMessageId: 'a2',
      apiKey: 'openrouter-key',
      authHeader: 'Bearer user-jwt',
      pendingRevisions: [],
    }, deps);

    expect(report.operations).toContainEqual(expect.objectContaining({
      name: 'mnemos_dialectic',
      status: 'queued',
    }));
    expect(fetchCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: 'https://example.supabase.co/functions/v1/mnemos-dialectic',
        body: expect.objectContaining({ thread_id: 't1', agent_id: 'quill' }),
      }),
      expect.objectContaining({
        url: 'https://example.supabase.co/functions/v1/skills-distill',
        body: expect.objectContaining({ thread_id: 't1', agent_id: 'quill' }),
      }),
    ]));
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
      reason: 'dialectic disabled',
    }));
    expect(report.operations).toContainEqual(expect.objectContaining({
      name: 'mnemos_dialectic',
      status: 'skipped',
      reason: 'dialectic disabled',
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
