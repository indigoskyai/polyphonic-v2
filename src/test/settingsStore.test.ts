import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }),
    },
    from: () => ({
      update: (patch: unknown) => {
        supabaseMock.update(patch);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    }),
  },
}));

import { defaultSettings, useSettingsStore } from '@/stores/settingsStore';

describe('settingsStore last chat target', () => {
  beforeEach(() => {
    supabaseMock.update.mockClear();
    useSettingsStore.setState({ ...defaultSettings, loaded: true });
  });

  it('persists the last used agent target and mirrors landing agent', async () => {
    await useSettingsStore.getState().setLastChatTarget({ kind: 'agent', id: 'clarity' });

    expect(useSettingsStore.getState()).toMatchObject({
      last_chat_target_kind: 'agent',
      last_chat_target_id: 'clarity',
      landing_agent_id: 'clarity',
    });
    expect(supabaseMock.update).toHaveBeenCalledWith({
      last_chat_target_kind: 'agent',
      last_chat_target_id: 'clarity',
      landing_agent_id: 'clarity',
    });
  });

  it('persists the last used raw model target without pretending it is Luca', async () => {
    await useSettingsStore.getState().setLastChatTarget({ kind: 'model', id: 'openai/gpt-5.1' });

    expect(useSettingsStore.getState()).toMatchObject({
      last_chat_target_kind: 'model',
      last_chat_target_id: 'openai/gpt-5.1',
      landing_agent_id: null,
    });
    expect(supabaseMock.update).toHaveBeenCalledWith({
      last_chat_target_kind: 'model',
      last_chat_target_id: 'openai/gpt-5.1',
      landing_agent_id: null,
    });
  });
});
