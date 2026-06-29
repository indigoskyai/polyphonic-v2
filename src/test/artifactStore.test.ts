import { beforeEach, describe, expect, it } from 'vitest';
import { useArtifactStore, type Artifact } from '@/stores/artifactStore';

const threadId = 'thread-simulation';

function artifact(partial: Partial<Artifact>): Artifact {
  return {
    id: 'artifact-1',
    user_id: 'user-1',
    thread_id: threadId,
    source_message_id: 'message-1',
    kind: 'simulation',
    title: 'Cooling preview',
    content: '{"version":1}',
    parent_artifact_id: null,
    version: 0,
    created_at: '2026-06-29T00:00:00.000Z',
    ...partial,
  };
}

describe('artifactStore local artifacts', () => {
  beforeEach(() => {
    useArtifactStore.setState({ byThread: {}, current: null });
  });

  it('keeps local simulation artifacts available for the current streamed turn', () => {
    useArtifactStore.getState().addLocalArtifacts(threadId, [
      artifact({ id: 'local-message-1-simulation-1' }),
    ]);

    expect(useArtifactStore.getState().byThread[threadId]).toHaveLength(1);
    expect(useArtifactStore.getState().byThread[threadId][0].id).toBe('local-message-1-simulation-1');
  });

  it('does not duplicate a local artifact with the same kind and content', () => {
    useArtifactStore.getState().addLocalArtifacts(threadId, [
      artifact({ id: 'local-message-1-simulation-1' }),
      artifact({ id: 'local-message-1-simulation-2' }),
    ]);

    expect(useArtifactStore.getState().byThread[threadId]).toHaveLength(1);
  });
});
