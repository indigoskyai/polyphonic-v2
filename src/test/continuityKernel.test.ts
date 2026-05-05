import { describe, expect, it } from 'vitest';
import {
  buildLucaPromptPartsFromContinuity,
  buildThreadContinuityNote,
  formatFunctionalMemoryBlock,
  formatMnemosAssociationsBlock,
  loadFunctionalMemories,
  loadContinuityPacket,
  type ContinuityLoaders,
  type FunctionalMemory,
} from '../../supabase/functions/_shared/continuity/kernel';
import { buildLucaSystemPrompt } from '../../supabase/functions/_shared/agents/luca-soul';
import { sanitizeContinuityBoundaryText } from '../../supabase/functions/_shared/continuity/exclusions';
import type { ActivationResult, Engram } from '../../supabase/functions/_shared/mnemos/types';

const supabaseStub = {} as any;

function engram(content: string, engram_type: Engram['engram_type'] = 'semantic'): ActivationResult {
  return {
    activation: 0.82,
    path: 'direct',
    engram: {
      id: 'e1',
      user_id: 'u1',
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
  matched?: any[];
  durable?: any[];
}) {
  return {
    rpc: async () => ({ data: matched, error: null }),
    from: () => ({
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return Promise.resolve({ data: durable, error: null }); },
    }),
  } as any;
}

describe('Continuity Kernel read path', () => {
  it('assembles one packet with stable precedence-ready prompt parts', async () => {
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
    expect(packet.diagnostics.filter((d) => d.status === 'error')).toHaveLength(0);

    const prompt = buildLucaSystemPrompt(buildLucaPromptPartsFromContinuity(packet));
    const pendingIndex = prompt.indexOf('## Pending revisions');
    const hypomnemaIndex = prompt.indexOf("## what i'm sitting with");
    const functionalIndex = prompt.indexOf('## what i reliably remember');
    const mnemosIndex = prompt.indexOf('## associations moving underneath');
    const skillsIndex = prompt.indexOf("## Relevant skills you've developed");

    expect(pendingIndex).toBeLessThan(hypomnemaIndex);
    expect(hypomnemaIndex).toBeLessThan(functionalIndex);
    expect(functionalIndex).toBeLessThan(mnemosIndex);
    expect(mnemosIndex).toBeLessThan(skillsIndex);
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
    expect(packet.diagnostics).toContainEqual(expect.objectContaining({
      layer: 'functional_memory',
      status: 'error',
      message: 'memory rpc unavailable',
    }));
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
