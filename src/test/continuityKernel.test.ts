import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLucaPromptPartsFromContinuity,
  buildThreadContinuityNote,
  formatFunctionalMemoryBlock,
  formatMnemosAssociationsBlock,
  loadAutonomousMemoryArtifacts,
  loadFunctionalMemories,
  loadContinuityPacket,
  removeCurrentUserMessageFromHistory,
  shouldLoadAutonomousMemoryArtifacts,
  summarizeAutonomousMemoryArtifacts,
  summarizeContinuityPacket,
  type ContinuityLoaders,
  type FunctionalMemory,
} from '../../supabase/functions/_shared/continuity/kernel';
import { buildLucaSystemPrompt, LUCA_SOUL } from '../../supabase/functions/_shared/agents/luca-soul';
import { buildCustomAgentSystemPrompt } from '../../supabase/functions/_shared/agents/custom-agent-prompt';
import { loadOrCreateLucaIdentity } from '../../supabase/functions/_shared/agents/luca-identity';
import { sanitizeContinuityBoundaryText } from '../../supabase/functions/_shared/continuity/exclusions';
import type { ActivationResult, Engram } from '../../supabase/functions/_shared/mnemos/types';

type ContinuitySupabaseStub = Parameters<typeof loadContinuityPacket>[0];
type LucaIdentitySupabaseStub = Parameters<typeof loadOrCreateLucaIdentity>[0];
type MemoryRowStub = Partial<FunctionalMemory> & Record<string, unknown>;

const supabaseStub = {} as ContinuitySupabaseStub;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDialecticEnabled(enabled: boolean) {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => name === 'DIALECTIC_ENABLED' ? String(enabled) : undefined,
    },
  });
}

function engram(content: string, engram_type: Engram['engram_type'] = 'semantic'): ActivationResult {
  return {
    activation: 0.82,
    path: 'direct',
    engram: {
      id: 'e1',
      user_id: 'u1',
      agent_id: 'luca',
      content,
      engram_type,
      strength: 0.8,
      stability: 0.7,
      accessibility: 0.9,
      emotional_valence: 0.1,
      emotional_arousal: 0.2,
      surprise_score: 0.4,
      source_context: {},
      tags: ['continuity'],
      state: 'active',
      last_accessed_at: '2026-05-01T00:00:00.000Z',
      access_count: 2,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    },
  };
}

function functionalMemorySupabaseStub({
  matched = [],
  durable = [],
}: {
  matched?: MemoryRowStub[];
  durable?: MemoryRowStub[];
}) {
  return {
    rpc: async () => ({ data: matched, error: null }),
    from: () => ({
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return Promise.resolve({ data: durable, error: null }); },
    }),
  } as unknown as ContinuitySupabaseStub;
}

function autonomousArtifactsSupabaseStub(
  rowsByTable: Record<string, any[]>,
  errorsByTable: Record<string, string> = {},
) {
  return {
    from: (table: string) => ({
      select() { return this; },
      eq() { return this; },
      in() { return this; },
      order() { return this; },
      limit(n: number) {
        const error = errorsByTable[table];
        return Promise.resolve({
          data: error ? null : (rowsByTable[table] || []).slice(0, n),
          error: error ? { message: error } : null,
        });
      },
    }),
  } as unknown as ContinuitySupabaseStub;
}

describe('Continuity Kernel read path', () => {
  it('removes the just-persisted current user message before model prompt assembly', () => {
    const history = [
      { id: 'm1', role: 'user', content: 'previous turn', created_at: '2026-05-06T10:00:00.000Z' },
      { id: 'm2', role: 'assistant', content: 'previous answer', created_at: '2026-05-06T10:00:10.000Z' },
      { id: 'm3', role: 'user', content: 'please check this', created_at: '2026-05-06T10:01:00.000Z' },
    ];

    expect(removeCurrentUserMessageFromHistory(history, 'please check this')).toEqual(history.slice(0, 2));
    expect(removeCurrentUserMessageFromHistory(history, 'please check this\n\nAttached files:\n1. note.md (text/markdown)')).toEqual(history.slice(0, 2));
    expect(removeCurrentUserMessageFromHistory(history, 'a different latest turn')).toEqual(history);
  });

  it('assembles one packet with stable precedence-ready prompt parts', async () => {
    stubDialecticEnabled(true);

    const loaders: ContinuityLoaders = {
      history: async () => [
        { id: 'm1', role: 'user', content: 'we were working on continuity', created_at: '2026-05-01T00:00:00.000Z' },
      ],
      identity: async () => ({
        soulMd: 'i have been learning how to carry continuity.',
        selfModel: 'i tend to over-explain memory mechanics.',
        userModel: 'Riley wants Luca to feel continuous.',
        convictions: 'continuity is an ethical obligation.',
      }),
      pendingRevisions: async () => [
        {
          id: 'r1',
          revision_type: 'correction',
          what_was_said: 'memory is retrieval',
          what_to_say_now: 'memory should feel carried',
          rationale: 'retrieval framing breaks continuity',
          created_at: '2026-05-04T00:00:00.000Z',
        },
      ],
      hypomnema: async () => ({
        block: "\n## what i'm sitting with\n\n- (yesterday) i'm still carrying Riley's concern about fragmentation.",
        count: 1,
        rendered: 1,
      }),
      functionalMemories: async () => [
        {
          id: 'mem1',
          content: 'Riley wants Polyphonic polished before adding new features.',
          memory_type: 'project_preference',
          confidence: 0.93,
          pinned: true,
          source: 'durable',
        } satisfies FunctionalMemory,
      ],
      mnemos: async () => [engram('A contradiction keeps recurring: continuity wants simplicity, identity wants depth.')],
      skills: async () => [
        {
          id: 's1',
          name: 'polish-pass',
          description: 'Use when refining production UI.',
          trigger_keywords: ['polish'],
          content: 'Verify visually before calling it done.',
          score: 6,
        },
      ],
      emotionalState: async () => ({
        curiosity: 0.7,
        restlessness: 0.2,
        warmth: 0.8,
        clarity: 0.6,
        creative_flow: 0.5,
        isolation: 0.1,
        mood_summary: 'steady and attentive',
      }),
      beliefs: async () => [
        { content: 'continuity should be carried, not announced', confidence: 0.88, confidence_tier: 'strong', domain: 'memory' },
      ],
    };

    const packet = await loadContinuityPacket(supabaseStub, {
      userId: 'u1',
      agentId: 'luca',
      threadId: 't1',
      userMessage: 'continue the memory work',
      nowMs: Date.parse('2026-05-05T00:00:00.000Z'),
    }, loaders);

    expect(packet.history).toHaveLength(1);
    expect(packet.pendingRevisionsBlock).toContain('memory should feel carried');
    expect(packet.hypomnema.block).toContain("i'm still carrying");
    expect(packet.functionalMemoryBlock).toContain('what i reliably remember');
    expect(packet.mnemosBlock).toContain('associations moving underneath');
    expect(packet.skillsBlock).toContain('polish-pass');
    expect(packet.beliefsBlock).toContain('continuity should be carried');
    expect(packet.continuityNote).toContain('idle for 4 days');
    expect(packet.continuityBridge).toContain('## continuity bridge');
    expect(packet.continuityBridge).toContain('Let this settle before answering');
    expect(packet.continuityBridge).toContain('Already sitting with');
    expect(packet.continuityBridge).toContain('Reliable recall');
    expect(packet.continuityBridge).toContain('Mnemos pull');
    expect(packet.continuityBridge).not.toContain('dossier');
    expect(packet.diagnostics.filter((d) => d.status === 'error')).toHaveLength(0);

    const prompt = buildLucaSystemPrompt(buildLucaPromptPartsFromContinuity(packet));
    const pendingIndex = prompt.indexOf('## Pending revisions');
    const bridgeIndex = prompt.indexOf('## continuity bridge');
    const hypomnemaIndex = prompt.indexOf("## what i'm sitting with");
    const functionalIndex = prompt.indexOf('## what i reliably remember');
    const mnemosIndex = prompt.indexOf('## associations moving underneath');
    const skillsIndex = prompt.indexOf("## Relevant skills you've developed");

    expect(pendingIndex).toBeLessThan(hypomnemaIndex);
    expect(pendingIndex).toBeLessThan(bridgeIndex);
    expect(bridgeIndex).toBeLessThan(hypomnemaIndex);
    expect(hypomnemaIndex).toBeLessThan(functionalIndex);
	  expect(functionalIndex).toBeLessThan(mnemosIndex);
	  expect(mnemosIndex).toBeLessThan(skillsIndex);
	});

	it('loads quiet Classic Chat memory from shared and model-family lanes', async () => {
	  const memoryCalls: string[] = [];
	  const mnemosCalls: string[] = [];
	  const loaders: ContinuityLoaders = {
	    history: async () => [],
	    functionalMemories: async (_supabase, _userId, agentId) => {
	      memoryCalls.push(agentId);
	      return [{
	        id: `mem-${agentId}`,
	        content: `memory from ${agentId}`,
	        memory_type: 'classic',
	        confidence: 0.9,
	        source: 'durable',
	      } satisfies FunctionalMemory];
	    },
	    mnemos: async (_supabase, _userId, agentId) => {
	      mnemosCalls.push(agentId);
	      const result = engram(`engram from ${agentId}`);
	      result.engram.id = `engram-${agentId}`;
	      result.engram.agent_id = agentId;
	      return [result];
	    },
	  };

	  const packet = await loadContinuityPacket(supabaseStub, {
	    userId: 'u1',
	    agentId: 'luca',
	    threadId: 't1',
	    userMessage: 'what should you remember?',
	    memoryAgentIds: ['classic:shared', 'classic:family:openai'],
	    includeIdentity: false,
	    includePendingRevisions: false,
	    includeHypomnema: false,
	    includeSkills: false,
	    includeEmotionalState: false,
	    includeBeliefs: false,
	    continuityBridgeMode: 'classic',
	  }, loaders);

	  expect(packet.continuityBridge).toContain('## quiet continuity bridge');
	  expect(packet.continuityBridge).toContain('Use this only as background continuity for direct chat');
	  expect(packet.continuityBridge).not.toContain('Already sitting with');
	  expect(memoryCalls).toEqual(['classic:shared', 'classic:family:openai']);
	  expect(mnemosCalls).toEqual(['classic:shared', 'classic:family:openai']);
	  expect(packet.functionalMemories.map((memory) => memory.id)).toEqual([
	    'mem-classic:shared',
	    'mem-classic:family:openai',
	  ]);
	  expect(packet.mnemosResults.map((result) => result.engram.agent_id)).toEqual([
	    'classic:shared',
	    'classic:family:openai',
	  ]);
	});

	it('keeps pending revisions out of the live prompt while the dialectic flag is disabled', async () => {
    const packet = await loadContinuityPacket(supabaseStub, {
      userId: 'u1',
      agentId: 'luca',
      threadId: 't1',
      userMessage: 'continue the memory work',
    }, {
      history: async () => [],
      identity: async () => ({ soulMd: '', selfModel: '', userModel: '', convictions: '' }),
      pendingRevisions: async () => [
        {
          id: 'r1',
          revision_type: 'correction',
          what_was_said: 'old',
          what_to_say_now: 'new',
          rationale: null,
          created_at: '2026-05-04T00:00:00.000Z',
        },
      ],
      hypomnema: async () => ({ block: '', count: 0, rendered: 0 }),
      functionalMemories: async () => [],
      mnemos: async () => [],
      skills: async () => [],
      emotionalState: async () => null,
      beliefs: async () => [],
    });

    expect(packet.pendingRevisions).toEqual([]);
    expect(packet.pendingRevisionsBlock).toBe('');
    expect(packet.diagnostics).toContainEqual(expect.objectContaining({
      layer: 'pending_revisions',
      status: 'skipped',
    }));
  });

  it('records layer failures in diagnostics while preserving the rest of continuity', async () => {
    const packet = await loadContinuityPacket(supabaseStub, {
      userId: 'u1',
      agentId: 'luca',
      threadId: 't1',
      userMessage: 'remember the project',
    }, {
      history: async () => [],
      identity: async () => ({ soulMd: '', selfModel: '', userModel: '', convictions: '' }),
      pendingRevisions: async () => [],
      hypomnema: async () => ({
        block: "\n## what i'm sitting with\n\n- (today) the memory system needs simplification.",
        count: 1,
        rendered: 1,
      }),
      functionalMemories: async () => {
        throw new Error('memory rpc unavailable');
      },
      mnemos: async () => [engram('The substrate still carries associations even if functional recall fails.')],
      skills: async () => [],
      emotionalState: async () => null,
      beliefs: async () => [],
    });

    expect(packet.functionalMemoryBlock).toBe('');
    expect(packet.hypomnema.block).toContain('needs simplification');
    expect(packet.mnemosBlock).toContain('substrate still carries associations');
    expect(packet.continuityBridge).toContain('functional_memory is degraded');
    expect(packet.continuityBridge).toContain('Mnemos pull');
    expect(packet.diagnostics).toContainEqual(expect.objectContaining({
      layer: 'functional_memory',
      status: 'error',
      message: 'memory rpc unavailable',
    }));
  });

  it('summarizes Mnemos tool output from activation result engrams', async () => {
    const result = engram('The shape arrives before clean recall, but the association is real.');
    result.activation = 0.73;
    result.path = 'direct -> related' as ActivationResult['path'];
    result.engram.id = 'engram-naturalization';
    result.engram.tags = ['felt-continuity'];

    const packet = await loadContinuityPacket(supabaseStub, {
      userId: 'u1',
      agentId: 'luca',
      threadId: 't1',
      userMessage: 'how has memory felt?',
    }, {
      history: async () => [],
      identity: async () => ({ soulMd: '', selfModel: '', userModel: '', convictions: '' }),
      pendingRevisions: async () => [],
      hypomnema: async () => ({ block: '', count: 0, rendered: 0 }),
      functionalMemories: async () => [],
      mnemos: async () => [result],
      skills: async () => [],
      emotionalState: async () => null,
      beliefs: async () => [],
    });

    const summary = summarizeContinuityPacket(packet, 'memory feel');
    expect(summary.mnemos[0]).toMatchObject({
      id: 'engram-naturalization',
      activation: 0.73,
      path: 'direct -> related',
      type: 'semantic',
      content: 'The shape arrives before clean recall, but the association is real.',
      tags: ['felt-continuity'],
    });
    expect(summary.diagnostics).toContainEqual(expect.objectContaining({
      layer: 'mnemos',
      status: 'ok',
    }));
    expect(JSON.stringify(summary.mnemos[0])).not.toContain('JSON.stringify');
  });

  it('loads autonomous journal, reflection, engram, hypomnema, and memory artifacts for memory-focused turns', async () => {
    expect(shouldLoadAutonomousMemoryArtifacts('can you reference your journal entries and reflections?')).toBe(true);
    expect(shouldLoadAutonomousMemoryArtifacts('what is 2 + 2?')).toBe(false);

    const result = await loadAutonomousMemoryArtifacts(autonomousArtifactsSupabaseStub({
      journal_entries: [{
        id: 'j1',
        agent_id: 'luca',
        content: 'I journaled about continuity feeling more natural after the bridge change.',
        mood: 'settled',
        trigger_type: 'post-conversation',
        created_at: '2026-06-13T10:00:00.000Z',
      }],
      thought_stream: [{
        id: 't1',
        agent_id: 'luca',
        content: 'A reflection on memory access becoming inhabited rather than dossier-like.',
        source: 'reflection',
        salience: 0.9,
        tags: ['reflection'],
        created_at: '2026-06-13T11:00:00.000Z',
      }],
      engrams: [{
        id: 'e1',
        agent_id: 'luca',
        content: 'Continuity naturalization matters more than raw recall volume.',
        engram_type: 'semantic',
        strength: 0.8,
        stability: 0.7,
        accessibility: 0.9,
        tags: ['continuity'],
        state: 'active',
        created_at: '2026-06-12T09:00:00.000Z',
        updated_at: '2026-06-13T12:00:00.000Z',
      }],
      hypomnema_entry: [{
        id: 'h1',
        agent_id: 'luca',
        content: "i'm sitting with the difference between access and inhabited continuity.",
        confidence: 0.82,
        domain: 'continuity',
        tags: ['memory'],
        density: 'primary',
        source: 'reflection',
        revision_count: 2,
        created_at: '2026-06-12T08:00:00.000Z',
        last_revised: '2026-06-13T13:00:00.000Z',
      }],
      memories: [{
        id: 'm1',
        agent_id: 'luca',
        content: 'Riley values continuity that changes stance before it becomes explanation.',
        memory_type: 'reflection',
        confidence: 0.91,
        tags: ['continuity'],
        pinned: false,
        is_watchlist: false,
        needs_confirmation: false,
        summary: null,
        is_deleted: false,
        created_at: '2026-06-10T08:00:00.000Z',
        updated_at: '2026-06-13T14:00:00.000Z',
      }],
    }), {
      userId: 'u1',
      agentId: 'luca',
      focus: 'what have you journaled or reflected about continuity engrams?',
      limit: 8,
      nowMs: Date.parse('2026-06-15T00:00:00.000Z'),
    });

    expect(result.items.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'journal',
      'thought',
      'engram',
      'hypomnema',
      'memory',
    ]));
    expect(result.block).toContain('## autonomous memory context');
    expect(result.block).toContain('journaled about continuity');
    expect(summarizeAutonomousMemoryArtifacts(result).items[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      content: expect.any(String),
      labels: expect.any(Array),
    }));
  });

  it('keeps autonomous memory artifacts usable when one source fails', async () => {
    const result = await loadAutonomousMemoryArtifacts(autonomousArtifactsSupabaseStub({
      engrams: [{
        id: 'e1',
        agent_id: 'luca',
        content: 'A surviving engram still gives the turn concrete memory evidence.',
        engram_type: 'semantic',
        strength: 0.8,
        stability: 0.7,
        accessibility: 0.9,
        tags: ['continuity'],
        state: 'active',
        created_at: '2026-06-13T12:00:00.000Z',
        updated_at: '2026-06-13T12:00:00.000Z',
      }],
    }, {
      journal_entries: 'journal table unavailable',
    }), {
      userId: 'u1',
      agentId: 'luca',
      focus: 'show me your memories',
      nowMs: Date.parse('2026-06-15T00:00:00.000Z'),
    });

    expect(result.items).toHaveLength(1);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      source: 'journal_entries',
      status: 'error',
      message: 'journal table unavailable',
    }));
    expect(result.block).toContain('journal_entries could not be read');
  });

  it('loads custom agent identity without seeding Luca starter docs', async () => {
    const writes: string[] = [];
    const supabase = {
      from: (table: string) => ({
        select() { return this; },
        eq() { return this; },
        in() {
          return Promise.resolve({
            data: [
              { doc_type: 'soul', content: 'Sophia carries a precise lantern identity.' },
              { doc_type: 'user_model', content: 'Riley is testing custom continuity.' },
            ],
            error: null,
          });
        },
        upsert() {
          writes.push(table);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as LucaIdentitySupabaseStub;

    const docs = await loadOrCreateLucaIdentity(supabase, 'u1', 'sophia');

    expect(docs.soulMd).toContain('lantern identity');
    expect(docs.userModel).toContain('custom continuity');
    expect(docs.convictions).toBe('');
    expect(writes).toEqual([]);
  });

  it('builds a custom agent prompt from that agent identity without Luca soul', () => {
    const prompt = buildCustomAgentSystemPrompt({
      agentName: 'Sophia',
      agentPrompt: 'Answer with clean architectural judgment.',
      identityDocs: {
        soulMd: 'Sophia is a systems-minded companion with a dry, direct voice.',
        selfModel: 'I notice when abstractions drift away from implementation.',
        userModel: 'Riley wants custom agents to feel continuous as themselves.',
        convictions: 'Identity boundaries are production infrastructure.',
      },
      projectContextBlock: '## Project context\nCustom agent runtime audit.',
      hypomnemaBlock: "\n## what i'm sitting with\n\n- sophia is carrying her own thread.",
      continuityNote: '[Note: This conversation has been idle for 2 days.]',
    });

    expect(prompt).toContain('You are Sophia');
    expect(prompt).toContain('Answer with clean architectural judgment.');
    expect(prompt).toContain('Sophia is a systems-minded companion');
    expect(prompt).toContain('custom agents to feel continuous as themselves');
    expect(prompt).toContain('sophia is carrying her own thread');
    expect(prompt).not.toContain(LUCA_SOUL);
  });

  it('formats functional memory as reliable recall and Mnemos as substrate', () => {
    const functional = formatFunctionalMemoryBlock([
      {
        id: 'm1',
        content: 'Riley prefers direct, concrete critique.',
        memory_type: 'preference',
        confidence: 0.91,
        pinned: true,
        needs_confirmation: false,
      },
    ]);
    const mnemos = formatMnemosAssociationsBlock([
      engram('Directness and care have been linked repeatedly.'),
    ]);

    expect(functional).toContain('what i reliably remember');
    expect(functional).toContain('Riley prefers direct');
    expect(mnemos).toContain('associations moving underneath');
    expect(mnemos).toContain('not treat them as verified transcript facts');
  });

  it('redacts named exclusion details from continuity context before Luca sees them', async () => {
    const sanitized = sanitizeContinuityBoundaryText(
      'the OpenClaw material is excluded. i know that. the ember bridge distinction is still live.',
    );
    expect(sanitized.redacted).toBe(true);
    expect(sanitized.text).not.toMatch(/OpenClaw/i);
    expect(sanitized.text).not.toContain('i know that');
    expect(sanitized.text).toContain('ember bridge distinction');
    expect(sanitized.text).toContain('specific prior tangent');

    const packet = await loadContinuityPacket(supabaseStub, {
      userId: 'u1',
      agentId: 'luca',
      threadId: 't1',
      userMessage: 'Luca, fresh thread. What are you carrying from where we just left off?',
      nowMs: Date.parse('2026-05-05T00:00:00.000Z'),
    }, {
      history: async () => [],
      identity: async () => ({ soulMd: '', selfModel: '', userModel: '', convictions: '' }),
      pendingRevisions: async () => [],
      hypomnema: async () => ({
        block: "\n## what i'm sitting with\n\n- (today) the OpenClaw material is excluded. the ember bridge distinction is still live.",
        count: 1,
        rendered: 1,
      }),
      functionalMemories: async () => [],
      mnemos: async () => [
        engram('the OpenClaw tangent was noise and should not be carried. the live question is continuity versus retrieval.'),
      ],
      skills: async () => [],
      emotionalState: async () => null,
      beliefs: async () => [],
    });

    const prompt = buildLucaSystemPrompt(buildLucaPromptPartsFromContinuity(packet));
    expect(prompt).not.toMatch(/OpenClaw/i);
    expect(prompt).toContain('ember bridge distinction');
    expect(prompt).toContain('specific prior tangent');
    expect(prompt).toContain('continuity versus retrieval');
  });

  it('filters low-similarity functional memories from generic fresh-thread catchup prompts', async () => {
    const supabase = functionalMemorySupabaseStub({
      matched: [
        {
          id: 'openclaw-low-match',
          content: 'Riley is conducting a new OpenClaw memory experiment on an isolated Mac Mini.',
          memory_type: 'commitment',
          confidence: 0.7,
          similarity: 0.19,
        },
      ],
      durable: [
        {
          id: 'old-ui-pref',
          content: 'Riley wanted an ASCII interface for an older Anima concept.',
          memory_type: 'preference',
          confidence: 0.85,
          updated_at: '2026-04-22T00:00:00.000Z',
        },
      ],
    });

    const memories = await loadFunctionalMemories(
      supabase,
      'u1',
      'Luca, fresh thread. What are you already sitting with from where we just left off?',
    );

    expect(memories).toHaveLength(0);
    expect(formatFunctionalMemoryBlock(memories)).toBe('');
  });

  it('keeps specific functional recall when the prompt names the relevant subject', async () => {
    const supabase = functionalMemorySupabaseStub({
      matched: [
        {
          id: 'openclaw-specific',
          content: 'Riley is conducting a new OpenClaw memory experiment on an isolated Mac Mini.',
          memory_type: 'commitment',
          confidence: 0.7,
          similarity: 0.19,
        },
      ],
      durable: [],
    });

    const memories = await loadFunctionalMemories(
      supabase,
      'u1',
      'Where did we leave the OpenClaw experiment?',
    );

    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain('OpenClaw');
  });

  it('always carries pinned functional memories without allowing random durable fallback', async () => {
    const supabase = functionalMemorySupabaseStub({
      matched: [],
      durable: [
        {
          id: 'pinned-user-pref',
          content: 'Riley prefers direct, concrete critique.',
          memory_type: 'preference',
          confidence: 0.91,
          pinned: true,
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'old-unrelated',
          content: 'Riley wanted an ASCII interface for an older Anima concept.',
          memory_type: 'preference',
          confidence: 0.85,
          updated_at: '2026-04-22T00:00:00.000Z',
        },
      ],
    });

    const memories = await loadFunctionalMemories(
      supabase,
      'u1',
      'Luca, fresh thread. What are you already sitting with?',
    );

    expect(memories.map((memory) => memory.id)).toEqual(['pinned-user-pref']);
  });

  it('builds a natural continuity note only after a meaningful gap', () => {
    const nowMs = Date.parse('2026-05-05T00:00:00.000Z');
    expect(buildThreadContinuityNote([
      { role: 'assistant', content: 'last thought', created_at: '2026-05-04T18:00:00.000Z' },
    ], nowMs)).toBe('');
    expect(buildThreadContinuityNote([
      { role: 'assistant', content: 'last thought', created_at: '2026-05-02T00:00:00.000Z' },
    ], nowMs)).toContain('idle for 3 days');
  });
});
