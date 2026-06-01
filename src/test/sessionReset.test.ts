// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  removeAllChannels: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    removeAllChannels: mocks.removeAllChannels,
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    auth: { getUser: vi.fn(), getSession: vi.fn() },
  },
}));

import { resetClientSessionStores } from '@/stores/sessionReset';
import { useAgentConsultStore } from '@/stores/agentConsultStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useArtifactStore } from '@/stores/artifactStore';
import { useAttachmentStore } from '@/stores/attachmentStore';
import { useBrowserSessionStore } from '@/stores/browserSessionStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useGroupSessionStore } from '@/stores/groupSessionStore';
import { useHypomnemaStore } from '@/stores/hypomnemaStore';
import { useMemoryCandidatesStore } from '@/stores/memoryCandidatesStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useObservabilityStore } from '@/stores/observabilityStore';
import { useObserverStore } from '@/stores/observerStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSubAgentStore } from '@/stores/subAgentStore';
import { useThreadStore } from '@/stores/threadStore';

describe('resetClientSessionStores', () => {
  beforeEach(() => {
    mocks.removeAllChannels.mockReset();
  });

  it('clears account-scoped client state after logout', () => {
    useThreadStore.setState({
      threads: [{ id: 'thread-1', user_id: 'user-1', title: 'private', pinned: false, starred: false, archived: false, heat: 'cold', agent_id: 'luca', primary_agent_id: 'luca', participating_agent_ids: ['luca'], project_id: 'project-1', created_at: '', updated_at: '' }],
      currentThreadId: 'thread-1',
      messages: [{
        id: 'message-1',
        thread_id: 'thread-1',
        user_id: 'user-1',
        role: 'user',
        content: 'private message',
        model: null,
        agent: null,
        thinking_content: null,
        tokens_used: null,
        bookmarked: false,
        created_at: '',
      }],
      isStreaming: true,
      streamingContent: 'private stream',
      streamingThinking: 'private thought',
    });
    useProjectStore.setState({
      projects: [{ id: 'project-1', user_id: 'user-1', name: 'Private project', description: null, instructions: null, color: 'neutral', icon: 'folder', pinned: false, archived: false, metadata: {}, created_at: '', updated_at: '' }],
      loading: true,
      error: 'private error',
    });
    useMemoryStore.setState({
      memories: [{ id: 'memory-1', content: 'private memory', memory_type: 'fact', confidence: 1, confidence_source: null, emotional_valence: null, emotional_intensity: null, detail_level: null, narrative_thread: null, tags: null, summary: null, staleness_risk: null, estimated_date: null, needs_confirmation: null, is_deleted: false, created_at: '', updated_at: '' }],
      engrams: [{ id: 'engram-1' } as never],
      connections: [{ id: 'connection-1' } as never],
      beliefs: [{ id: 'belief-1' } as never],
      selectedEngram: { id: 'engram-1' } as never,
      loading: true,
      loadErrors: { memories: 'failed' },
    });
    useHypomnemaStore.setState({ entries: [{ id: 'hyp-1' } as never], loading: true });
    useCognitiveStore.setState({
      modulators: { arousal: 1, resolution: 1, openness: 1, surprise_threshold: 1, social_drive: 1 },
      emotions: { valence: 1, arousal: 1, dominance: 1, certainty: 1, novelty: 1, social: 1 },
      thoughts: [{ id: 'thought-1' } as never],
      recentEvents: [{ id: 'event-1' } as never],
      activityLog: [{ id: 'activity-1' } as never],
      newThoughtIds: new Set(['thought-1']),
      loaded: true,
    });
    useNotificationStore.setState({
      initiations: [{ id: 'init-1' } as never],
      activity: [{ id: 'activity-1' } as never],
      lastSeenAt: '2026-05-05T00:00:00.000Z',
      readIds: new Set(['activity-1']),
    });
    useObserverStore.setState({
      notesByThread: { 'thread-1': [{ id: 'note-1' } as never] },
      chatByThread: { 'thread-1': [{ id: 'observer-message-1' } as never] },
      loadingThread: 'thread-1',
      asking: true,
    });
    useSubAgentStore.setState({
      agents: { 'agent-1': { id: 'agent-1' } as never },
      events: [{ id: 'event-1' } as never],
      overlayOpenForParent: 'luca',
      selectedAgentId: 'agent-1',
    });
    useAttachmentStore.setState({ pending: [{ id: 'attachment-1' } as never] });
    useArtifactStore.setState({ byThread: { 'thread-1': [{ id: 'artifact-1' } as never] }, current: { id: 'artifact-1' } as never });
    useAgentConsultStore.setState({ byThread: { 'thread-1': [{ id: 'consult-1' } as never] } });
    useAgentSettingsStore.setState({ agents: [{ id: 'custom-agent' } as never], loading: true, draftById: { 'custom-agent': { name: 'Draft' } as never } });
    useMemoryCandidatesStore.setState({ items: [{ id: 'candidate-1' } as never], loading: true, error: 'failed' });
    useBrowserSessionStore.setState({ sessions: { 'browser-1': { id: 'browser-1' } as never } });
    useGroupSessionStore.setState({ transcript: [{ id: 'transcript-1' } as never], micActive: true });
    useObservabilityStore.setState({
      agents: [{ agent: 'luca', status: 'running', tokensSinceMidnight: 99, lastActivityAt: 'now' }],
      sparkline: [1, 2, 3],
      activeSubagents: [{ id: 'active-1' } as never],
      expanded: true,
    });
    useSettingsStore.setState({ loaded: true, default_model: 'other/model', font_size: 18 });

    resetClientSessionStores();

    expect(mocks.removeAllChannels).toHaveBeenCalledTimes(1);
    expect(useThreadStore.getState()).toMatchObject({
      threads: [],
      currentThreadId: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
    });
    expect(useProjectStore.getState()).toMatchObject({ projects: [], loading: false, error: null });
    expect(useMemoryStore.getState()).toMatchObject({
      memories: [],
      engrams: [],
      connections: [],
      beliefs: [],
      selectedEngram: null,
      loading: false,
      loadErrors: {},
    });
    expect(useHypomnemaStore.getState()).toMatchObject({ entries: [], loading: false });
    expect(useCognitiveStore.getState()).toMatchObject({
      modulators: { arousal: 0.5, resolution: 0.5, openness: 0.5, surprise_threshold: 0.5, social_drive: 0.5 },
      emotions: { valence: 0, arousal: 0.3, dominance: 0.5, certainty: 0.5, novelty: 0.5, social: 0.5 },
      thoughts: [],
      recentEvents: [],
      activityLog: [],
      loaded: false,
    });
    expect(useCognitiveStore.getState().newThoughtIds.size).toBe(0);
    expect(useNotificationStore.getState()).toMatchObject({
      initiations: [],
      activity: [],
      lastSeenAt: null,
      filter: 'all',
    });
    expect(useNotificationStore.getState().readIds.size).toBe(0);
    expect(useObserverStore.getState()).toMatchObject({
      notesByThread: {},
      chatByThread: {},
      loadingThread: null,
      asking: false,
    });
    expect(useSubAgentStore.getState()).toMatchObject({
      agents: {},
      events: [],
      overlayOpenForParent: null,
      selectedAgentId: null,
      pendingCancel: null,
    });
    expect(useAgentConsultStore.getState().byThread).toEqual({});
    expect(useAgentSettingsStore.getState()).toMatchObject({ agents: [], loading: false, draftById: {} });
    expect(useMemoryCandidatesStore.getState()).toMatchObject({ items: [], loading: false, error: null });
    expect(useBrowserSessionStore.getState().sessions).toEqual({});
    expect(useGroupSessionStore.getState()).toMatchObject({ transcript: [], micActive: false });
    expect(useObservabilityStore.getState()).toMatchObject({
      activeSubagents: [],
      expanded: false,
    });
    expect(useObservabilityStore.getState().agents).toHaveLength(3);
    expect(useObservabilityStore.getState().sparkline).toHaveLength(24);
    expect(useSettingsStore.getState()).toMatchObject({
      loaded: false,
      default_model: 'moonshotai/kimi-k2.6',
      font_size: 14,
    });
    expect(useAttachmentStore.getState().pending).toEqual([]);
    expect(useArtifactStore.getState()).toMatchObject({ byThread: {}, current: null });
  });
});
