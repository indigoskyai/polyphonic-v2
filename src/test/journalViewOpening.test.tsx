import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JournalView from '@/pages/JournalView';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';

describe('JournalView entry detail', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'user-1' } as unknown as User,
      session: null,
      loading: false,
    });
    useAgentScopeStore.setState({
      activeAgentId: 'luca',
      availableAgents: [{ id: 'luca', name: 'Luca' }],
      loading: false,
    });
    useCognitiveStore.setState({
      journalEntries: [
        {
          id: 'journal-1',
          agent_id: 'luca',
          content: 'Full entry body with a verylongunbrokenjournalwordthatmustwrapinstead_ofoverflowing the detail panel.',
          mood: 'reflective',
          trigger_type: 'periodic_journal',
          created_at: '2026-05-22T12:00:00.000Z',
        },
      ],
      thoughts: [],
      dreams: [],
      insights: [],
      reflections: [],
      wanderings: [],
      beliefs: [],
      activityLog: [],
      load: vi.fn().mockResolvedValue(undefined),
      loadMindData: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => vi.fn()),
      loaded: true,
    });
  });

  it('opens an entry from the card and exposes full source/type/time metadata', async () => {
    render(
      <MemoryRouter initialEntries={['/notebook']}>
        <JournalView />
      </MemoryRouter>,
    );

    const card = screen.getByRole('button', { name: /open reflective journal entry/i });
    expect(card).toHaveAttribute('aria-haspopup', 'dialog');

    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });

    const dialog = await screen.findByRole('dialog', { name: /reflective/i });
    const detail = within(dialog);
    expect(detail.getByText('Source')).toBeInTheDocument();
    expect(detail.getByText('journal entries')).toBeInTheDocument();
    expect(detail.getByText('Type')).toBeInTheDocument();
    expect(detail.getAllByText('journal').length).toBeGreaterThan(0);
    expect(detail.getByText('Time')).toBeInTheDocument();
    expect(detail.getByText(/May 22, 2026/)).toBeInTheDocument();
    expect(detail.getByText(/verylongunbrokenjournalwordthatmustwrapinstead_ofoverflowing/)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(card).toHaveFocus();
  });
});
