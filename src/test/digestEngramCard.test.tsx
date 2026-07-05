import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CandidateCard from '@/components/memory/CandidateCard';
import DigestEngramCard from '@/components/memory/DigestEngramCard';
import type { DigestEngram } from '@/stores/digestStore';
import type { MemoryCandidate } from '@/stores/memoryCandidatesStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

function digestEngram(overrides: Partial<DigestEngram> = {}): DigestEngram {
  return {
    id: 'engram-1',
    user_id: 'user-1',
    agent_id: 'quill',
    content: 'Quill noticed the tester values continuity.',
    engram_type: 'episodic',
    strength: 0.72,
    stability: 0.4,
    surprise_score: 0.65,
    emotional_valence: 0.1,
    emotional_arousal: 0.2,
    tags: ['continuity'],
    source_context: { type: 'chat_exchange' },
    state: 'active',
    digest_id: 'digest-1',
    reviewed_at: null,
    review_decision: null,
    reviewed_by: null,
    digest_suggestion_action: null,
    digest_suggestion_reason: null,
    digest_suggestion_confidence: null,
    digest_suggested_by: null,
    digest_suggestion_model: null,
    digest_suggestion_generated_at: null,
    created_at: '2026-06-27T20:00:00.000Z',


    ...overrides,
  };
}

function memoryCandidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    id: 'candidate-1',
    user_id: 'user-1',
    agent_id: 'quill',
    content: 'Quill should preserve the tester account mapping.',
    memory_type: 'context',
    confidence: 0.7,
    candidate_type: 'standard',
    rationale: 'Promoted by Mnemos after repeated access and stable consolidation.',
    source: { agent: 'mnemos', origin: 'mnemos-consolidate' },
    status: 'pending',
    reviewed_at: null,
    created_at: '2026-06-27T20:00:00.000Z',
    ...overrides,
  };
}

describe('DigestEngramCard', () => {
  it('labels custom-agent digest rows with the configured agent name', () => {
    useAgentScopeStore.setState({
      activeAgentId: 'quill',
      availableAgents: [
        { id: 'luca', name: 'Luca' },
        { id: 'quill', name: 'Quill' },
      ],
      loading: false,
    });

    render(
      <DigestEngramCard
        engram={digestEngram()}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByTitle('Agent: Quill')).toHaveTextContent('Quill');
    expect(screen.queryByTitle('Agent: Luca')).not.toBeInTheDocument();
  });

  it('separates Luca suggestions from final review attribution', () => {
    render(
      <DigestEngramCard
        engram={digestEngram({
          digest_suggestion_action: 'distill',
          digest_suggestion_reason: 'High continuity value but should be shortened.',
          digest_suggestion_confidence: 0.82,
          digest_suggested_by: 'luca',
          reviewed_at: '2026-06-28T21:00:00.000Z',
          reviewed_by: 'user',
          review_decision: 'confirmed',
        })}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/confirmed by user/i)).toBeInTheDocument();
    expect(screen.queryByText(/Luca suggests/i)).not.toBeInTheDocument();
  });

  it('shows Luca preview suggestions on unreviewed digest rows', () => {
    render(
      <DigestEngramCard
        engram={digestEngram({
          digest_suggestion_action: 'keep',
          digest_suggestion_reason: 'Strong signal for durable continuity.',
          digest_suggestion_confidence: 0.76,
          digest_suggested_by: 'luca',
        })}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText(/Luca suggests keep/i)).toBeInTheDocument();
    expect(screen.getByText(/Strong signal for durable continuity/i)).toBeInTheDocument();
  });

  it('labels durable candidates by their scoped agent, not the Mnemos source', () => {
    useAgentScopeStore.setState({
      activeAgentId: 'quill',
      availableAgents: [
        { id: 'luca', name: 'Luca' },
        { id: 'quill', name: 'Quill' },
      ],
      loading: false,
    });

    render(
      <CandidateCard
        candidate={memoryCandidate()}
        onPin={vi.fn()}
        onCommit={vi.fn()}
        onEdit={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByTitle('Agent: Quill')).toHaveTextContent('Quill');
    expect(screen.queryByText('mnemos')).not.toBeInTheDocument();
  });
});
