import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type ArtifactKind = 'html' | 'react' | 'svg' | 'mermaid' | 'markdown';

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
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: (data || []) as Artifact[] },
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

  setCurrent: (artifact) => set({ current: artifact }),
}));
