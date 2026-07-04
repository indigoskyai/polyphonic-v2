import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemorySettingsPanel from '@/components/memory/MemorySettingsPanel';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useAuthStore } from '@/stores/authStore';

const supabaseMock = vi.hoisted(() => {
  const upserts: Array<Record<string, unknown>> = [];
  const rows = {
    memory_settings: {
      mnemos_enabled: true,
      full_cognition_enabled: false,
      decay_rate: 50,
      dream_frequency: 'daily',
      consolidation_enabled: true,
      softening_enabled: false,
      softening_dry_run: true,
    },
  };

  function chainFor(table: string) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: table === 'memory_settings' ? rows.memory_settings : null, error: null })),
      insert: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn(async (payload: Record<string, unknown>) => {
        upserts.push(payload);
        return { data: null, error: null };
      }),
      delete: vi.fn(() => chain),
    };
    return chain;
  }

  return {
    upserts,
    client: {
      from: vi.fn((table: string) => chainFor(table)),
      functions: { invoke: vi.fn() },
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn(async () => ({ data: { session: null } })),
        signOut: vi.fn(async () => ({ error: null })),
      },
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseMock.client,
}));

describe('MemorySettingsPanel', () => {
  beforeEach(() => {
    supabaseMock.upserts.length = 0;
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      session: null,
      loading: false,
    });
    useAgentScopeStore.setState({
      activeAgentId: 'luca',
      availableAgents: [{ id: 'luca', name: 'Luca' }],
      loading: false,
    });
  });

  it('reads, toggles, and saves explicit full cognition consent', async () => {
    render(
      <BrowserRouter>
        <MemorySettingsPanel />
      </BrowserRouter>,
    );

    const label = await screen.findByText('Full cognition');
    const row = label.closest('.set-row');
    expect(row).not.toBeNull();
    const toggle = within(row as HTMLElement).getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    await waitFor(() => {
      expect(supabaseMock.upserts.at(-1)).toMatchObject({
        user_id: 'user-1',
        full_cognition_enabled: true,
      });
    });
  });
});
