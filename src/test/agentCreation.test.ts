import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  },
}));

import { useAgentSettingsStore, type AgentConfig } from '@/stores/agentSettingsStore';

const savedAgentRow = {
  id: 'sophia',
  user_id: 'user-1',
  name: 'Sophia',
  role: 'researcher',
  avatar_color: 'sage',
  is_system: false,
  locked: false,
  created_by: 'user',
  pending: false,
  env: 'prod',
  model: 'openai/gpt-5.5',
  prompt: 'You are Sophia.',
  personality: { inner_life: true, thought_verbosity: 1, voice_description: 'clear and warm' },
  tools: [],
  subagents: [],
  voices: [],
};

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('custom agent creation flow', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.from.mockReset();
    useAgentSettingsStore.setState({ agents: [], loading: false, draftById: {} });
  });

  it('creates custom agents through the authenticated edge function', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, config: savedAgentRow }, error: null });

    const result = await useAgentSettingsStore.getState().createAgent('user-1', {
      name: 'Sophia',
      role: 'researcher',
      avatar_color: 'sage',
      model: 'openai/gpt-5.5',
      prompt: 'You are Sophia.',
      personality: { voice_description: 'clear and warm' },
    });

    expect(result).toEqual({ ok: true, id: 'sophia' });
    expect(mocks.from).not.toHaveBeenCalledWith('agent_configs');
    expect(mocks.invoke).toHaveBeenCalledWith('agent-config-save', {
      body: expect.objectContaining({
        id: 'sophia',
        name: 'Sophia',
        role: 'researcher',
        avatar_color: 'sage',
        env: 'prod',
        model: 'openai/gpt-5.5',
        prompt: 'You are Sophia.',
      }),
    });
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('user_id');
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('is_system');
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('locked');
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('created_by');
    expect(useAgentSettingsStore.getState().agents[0]).toMatchObject({
      id: 'sophia',
      name: 'Sophia',
      created_by: 'user',
      is_system: false,
      locked: false,
    });
  });

  it('saves editable agent configs through the same guarded function', async () => {
    const agent = {
      ...savedAgentRow,
      tools: [],
      mcp: [],
      subagents: [],
      voices: [],
      secrets: [],
      status: 'on',
      uptimeMs: 0,
    } as AgentConfig;
    useAgentSettingsStore.setState({
      agents: [agent],
      loading: false,
      draftById: { sophia: { prompt: 'Updated Sophia prompt.' } },
    });
    mocks.invoke.mockResolvedValue({
      data: { ok: true, config: { ...savedAgentRow, prompt: 'Updated Sophia prompt.' } },
      error: null,
    });

    const result = await useAgentSettingsStore.getState().save('sophia', 'user-1');

    expect(result).toEqual({ ok: true });
    expect(mocks.from).not.toHaveBeenCalledWith('agent_configs');
    expect(mocks.invoke).toHaveBeenCalledWith('agent-config-save', {
      body: expect.objectContaining({
        id: 'sophia',
        prompt: 'Updated Sophia prompt.',
      }),
    });
    expect(useAgentSettingsStore.getState().draftById).toEqual({});
  });

  it('keeps the Agents page wired to the creation modal', () => {
    const source = readRepoFile('src/pages/settings/AgentsList.tsx');

    expect(source).toContain('CreateAgentModal');
    expect(source).toContain('New agent');
    expect(source).not.toContain('Custom agent creation is paused');
    expect(source).not.toContain('Agent creation is currently disabled');
  });

  it('keeps agent-config-save responsible for safe custom-agent creation', () => {
    const source = readRepoFile('supabase/functions/agent-config-save/index.ts');

    expect(source).toContain('RESERVED_AGENT_IDS');
    expect(source).toContain('Name and role are required when creating an agent');
    expect(source).toContain('is_system: false');
    expect(source).toContain('locked: false');
    expect(source).toContain('created_by: "user"');
    expect(source).toContain('Resident and system agents are platform-controlled');
  });
});
