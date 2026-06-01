import { supabase } from '@/integrations/supabase/client';
import { useAgentConsultStore } from '@/stores/agentConsultStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useArtifactStore } from '@/stores/artifactStore';
import { useAttachmentStore } from '@/stores/attachmentStore';
import { useBrowserSessionStore } from '@/stores/browserSessionStore';
import { useCheckpointStore } from '@/stores/checkpointStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';
import { useDigestStore } from '@/stores/digestStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useGroupSessionStore } from '@/stores/groupSessionStore';
import { useHandleStore } from '@/stores/handleStore';
import { useHypomnemaStore } from '@/stores/hypomnemaStore';
import { useImportStore } from '@/stores/importStore';
import { useMemoryCandidatesStore } from '@/stores/memoryCandidatesStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useObservabilityStore } from '@/stores/observabilityStore';
import { useObserverStore } from '@/stores/observerStore';
import { usePermissionModalStore } from '@/stores/permissionModalStore';
import { useProfileCanvasStore } from '@/stores/profileCanvasStore';
import { useProjectStore } from '@/stores/projectStore';
import { defaultSettings, useSettingsStore } from '@/stores/settingsStore';
import { useSubAgentStore } from '@/stores/subAgentStore';
import { useThreadStore } from '@/stores/threadStore';

export function resetClientSessionStores(): void {
  void (supabase as unknown as { removeAllChannels?: () => Promise<unknown> }).removeAllChannels?.();

  useThreadStore.setState({
    threads: [],
    currentThreadId: null,
    messages: [],
    isStreaming: false,
    streamingContent: '',
    streamingThinking: '',
  });
  useProjectStore.setState({ projects: [], loading: false, error: null });
  useAttachmentStore.setState({ pending: [] });
  useMemoryStore.setState({
    engrams: [],
    connections: [],
    beliefs: [],
    memories: [],
    selectedEngram: null,
    loading: false,
    loadErrors: {},
    filters: { engram_type: null, state: null, sort: 'recency', search: '' },
  });
  useHypomnemaStore.setState({ entries: [], loading: false });
  useCognitiveStore.setState({
    scope: null,
    modulators: {
      arousal: 0.5,
      resolution: 0.5,
      openness: 0.5,
      surprise_threshold: 0.5,
      social_drive: 0.5,
    },
    emotions: {
      valence: 0,
      arousal: 0.3,
      dominance: 0.5,
      certainty: 0.5,
      novelty: 0.5,
      social: 0.5,
    },
    beliefs: [],
    thoughts: [],
    recentEvents: [],
    activityLog: [],
    emotionalWeather: null,
    dreams: [],
    insights: [],
    reflections: [],
    wanderings: [],
    journalEntries: [],
    loaded: false,
    newThoughtIds: new Set(),
    memoryStats: { total_engrams: 0, active: 0, dormant: 0, archived: 0, connections: 0, beliefs_count: 0 },
  });
  useNotificationStore.setState({
    initiations: [],
    activity: [],
    lastSeenAt: null,
    readIds: new Set(),
    filter: 'all',
  });
  useDigestStore.setState({
    digest: null,
    engrams: [],
    loading: false,
    refreshing: false,
    error: null,
  });
  useCheckpointStore.setState({
    checkpoints: [],
    loading: false,
    expandedIds: new Set(),
    openFiles: {},
    selectedForCompare: [null, null],
    compareResult: null,
    compareLoading: false,
  });
  useImportStore.setState({
    stage: 'idle',
    fileName: '',
    fileSize: 0,
    totalConversations: 0,
    filteredCount: 0,
    processedChunks: 0,
    totalChunks: 0,
    memoriesCreated: 0,
    questionsGenerated: 0,
    conflictsDetected: 0,
    pipelineDetail: '',
    error: null,
    importId: null,
    filterStats: null,
    preparedConversations: null,
    platform: null,
    dismissed: false,
    profileData: null,
  });
  useObserverStore.setState({
    notesByThread: {},
    chatByThread: {},
    loadingThread: null,
    asking: false,
  });
  const pendingCancel = useSubAgentStore.getState().pendingCancel;
  if (pendingCancel && typeof window !== 'undefined') {
    window.clearTimeout(pendingCancel.timeoutId);
  }
  useSubAgentStore.setState({
    agents: {},
    events: [],
    overlayOpenForParent: null,
    overlayThreadId: null,
    selectedAgentId: null,
    pendingCancel: null,
  });
  useAgentConsultStore.setState({ byThread: {} });
  useAgentSettingsStore.setState({ agents: [], loading: false, draftById: {} });
  useMemoryCandidatesStore.setState({ items: [], loading: false, error: null });
  useBrowserSessionStore.setState({ sessions: {} });
  useGroupSessionStore.getState().reset();
  useObservabilityStore.setState({
    agents: [
      { agent: 'luca', status: 'idle', tokensSinceMidnight: 0, lastActivityAt: null },
      { agent: 'vektor', status: 'idle', tokensSinceMidnight: 0, lastActivityAt: null },
      { agent: 'anima', status: 'idle', tokensSinceMidnight: 0, lastActivityAt: null },
    ],
    sparkline: new Array(24).fill(0),
    activeSubagents: [],
    updatedAt: new Date().toISOString(),
    expanded: false,
  });
  useArtifactStore.setState({ byThread: {}, current: null });
  useProfileCanvasStore.setState({
    profile: null,
    items: [],
    loading: false,
    selectedId: null,
  });
  useHandleStore.setState({ myHandle: null, myAgentHandles: [], loading: false });
  useSettingsStore.setState({ ...defaultSettings, loaded: false });
  useAgentScopeStore.setState({ activeAgentId: 'luca' });
  useDrawerStore.setState({ active: null, payload: null });
  usePermissionModalStore.setState({ active: null });
}
