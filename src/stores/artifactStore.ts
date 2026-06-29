import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type ArtifactKind = 'html' | 'react' | 'svg' | 'mermaid' | 'markdown' | 'simulation';

export interface Artifact {
  id: string;
  user_id: string;
  thread_id: string;
  source_message_id: string | null;
  kind: ArtifactKind;
  title: string | null;
  content: string;
  parent_artifact_id: string | null;
  version: number;
  created_at: string;
}

interface ArtifactState {
  byThread: Record<string, Artifact[]>;
  current: Artifact | null;
  loadForThread: (threadId: string) => Promise<void>;
  loadOne: (id: string) => Promise<Artifact | null>;
  addLocalArtifacts: (threadId: string, artifacts: Artifact[]) => void;
  setCurrent: (artifact: Artifact | null) => void;
}

export const useArtifactStore = create<ArtifactState>((set) => ({
  byThread: {},
  current: null,

  loadForThread: async (threadId) => {
    const { data } = await supabase
      .from('artifacts')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    const remote = (data || []) as Artifact[];
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: mergeArtifacts(remote, state.byThread[threadId] || []) },
    }));
  },

  loadOne: async (id) => {
    const { data } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const artifact = (data as Artifact | null) || null;
    set({ current: artifact });
    return artifact;
  },

  addLocalArtifacts: (threadId, artifacts) => {
    if (artifacts.length === 0) return;
    set((state) => ({
      byThread: {
        ...state.byThread,
        [threadId]: mergeArtifacts(state.byThread[threadId] || [], artifacts),
      },
    }));
  },

  setCurrent: (artifact) => set({ current: artifact }),
}));

function mergeArtifacts(primary: Artifact[], secondary: Artifact[]): Artifact[] {
  const byId = new Map<string, Artifact>();
  const seenContent = new Set<string>();
  const push = (artifact: Artifact) => {
    const contentKey = `${artifact.kind}:${artifact.content}`;
    if (seenContent.has(contentKey)) return;
    seenContent.add(contentKey);
    byId.set(artifact.id, artifact);
  };
  primary.forEach(push);
  secondary.filter((artifact) => artifact.id.startsWith('local-')).forEach(push);
  return Array.from(byId.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
