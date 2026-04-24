import { create } from 'zustand';

export type MemoryTab = 'Memories' | 'Engrams' | 'Beliefs' | 'Graph' | 'Imports' | 'Settings';
export type MindTab = 'Overview' | 'Journal' | 'Thoughts' | 'Dreams' | 'Wanderings' | 'Insights' | 'Reflections';
export type ProfileTab =
  | 'Portrait'
  | 'Personality'
  | 'Communication'
  | 'Emotions'
  | 'Values'
  | 'Relationships'
  | 'Cognition'
  | 'Growth'
  | 'Shadow';

interface ViewTabState {
  memoryTab: MemoryTab;
  memoryTypeFilter: string | null;
  memoryPinnedOnly: boolean;
  mindTab: MindTab;
  profileTab: ProfileTab;
  setMemoryTab: (v: MemoryTab) => void;
  setMemoryTypeFilter: (v: string | null) => void;
  setMemoryPinnedOnly: (v: boolean) => void;
  setMindTab: (v: MindTab) => void;
  setProfileTab: (v: ProfileTab) => void;
}

export const useViewTabStore = create<ViewTabState>((set) => ({
  memoryTab: 'Memories',
  memoryTypeFilter: null,
  memoryPinnedOnly: false,
  mindTab: 'Overview',
  profileTab: 'Portrait',
  setMemoryTab: (v) => set({ memoryTab: v }),
  setMemoryTypeFilter: (v) => set({ memoryTypeFilter: v }),
  setMemoryPinnedOnly: (v) => set({ memoryPinnedOnly: v }),
  setMindTab: (v) => set({ mindTab: v }),
  setProfileTab: (v) => set({ profileTab: v }),
}));
