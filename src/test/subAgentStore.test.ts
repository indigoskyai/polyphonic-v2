import { describe, beforeEach, expect, it } from 'vitest';
import {
  deriveSubAgentFamily,
  useSubAgentStore,
  type SubAgentTaskRow,
} from '@/stores/subAgentStore';

function row(overrides: Partial<SubAgentTaskRow> = {}): SubAgentTaskRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    parent_thread_id: 'thread-1',
    agent_id: 'luca',
    task_description: 'research polyphony',
    status: 'pending',
    started_at: null,
    completed_at: null,
    progress: 0,
    ...overrides,
  };
}

describe('subAgentStore remote sync', () => {
  beforeEach(() => {
    useSubAgentStore.setState({
      agents: {},
      events: [],
      overlayOpenForParent: null,
      selectedAgentId: null,
      pendingCancel: null,
    });
  });

  it('hydrates remote tasks into store with stable family hash', () => {
    const family = deriveSubAgentFamily('11111111-1111-1111-1111-111111111111');
    expect(['v1', 'v2', 'v3']).toContain(family);

    useSubAgentStore.getState().hydrateRemoteTasks([row({ status: 'running', started_at: '2026-04-28T17:00:00Z' })]);
    const stored = useSubAgentStore.getState().agents['remote-11111111-1111-1111-1111-111111111111'];
    expect(stored.state).toBe('active');
    expect(stored.family).toBe(family);
    expect(stored.parentAgent).toBe('luca');
    expect(stored.task).toBe('research polyphony');
    expect(stored.source).toBe('remote');
    expect(stored.threadId).toBe('thread-1');
  });

  it('promotes status to complete with progress=1 when row marks completed', () => {
    useSubAgentStore.getState().syncRemoteTask(row({ status: 'running', progress: 0.4 }));
    useSubAgentStore.getState().syncRemoteTask(row({ status: 'completed', completed_at: '2026-04-28T17:05:00Z', progress: 0.9 }));

    const stored = useSubAgentStore.getState().agents['remote-11111111-1111-1111-1111-111111111111'];
    expect(stored.state).toBe('complete');
    expect(stored.progress).toBe(1);
    expect(stored.endedAt).not.toBeNull();
  });

  it('prunes completed remote tasks once they age out', () => {
    const completedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    useSubAgentStore.getState().syncRemoteTask(row({ status: 'completed', completed_at: completedAt }));
    expect(Object.keys(useSubAgentStore.getState().agents)).toHaveLength(1);

    useSubAgentStore.getState().pruneStaleRemoteTasks();
    expect(useSubAgentStore.getState().agents).toEqual({});
  });

  it('keeps a running remote task even if older than the prune window', () => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    useSubAgentStore.getState().syncRemoteTask(row({ status: 'running', started_at: startedAt }));
    useSubAgentStore.getState().pruneStaleRemoteTasks();
    expect(Object.keys(useSubAgentStore.getState().agents)).toHaveLength(1);
  });

  it('does not duplicate work when an unchanged update arrives', () => {
    const start = useSubAgentStore.getState().syncRemoteTask;
    start(row({ status: 'running', progress: 0.5 }));
    const before = useSubAgentStore.getState().agents['remote-11111111-1111-1111-1111-111111111111'];
    start(row({ status: 'running', progress: 0.5 }));
    const after = useSubAgentStore.getState().agents['remote-11111111-1111-1111-1111-111111111111'];
    expect(after).toBe(before);
  });
});
