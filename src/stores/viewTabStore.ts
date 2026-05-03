import { create } from 'zustand';

export type MemoryTab = 'Memories' | 'Engrams' | 'Beliefs' | 'Graph' | 'Imports' | 'Settings';
export type MindTab = 'Overview' | 'Thoughts' | 'Dreams' | 'Wanderings' | 'Insights' | 'Reflections' | 'Beliefs' | 'Activity';
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

export type MnemosMode = 'browse' | 'digest';

interface ViewTabState {
  memoryTab: MemoryTab;
  memoryTypeFilter: string | null;
  memoryPinnedOnly: boolean;
  mnemosMode: MnemosMode;
  mindTab: MindTab;
  profileTab: ProfileTab;
  setMemoryTab: (v: MemoryTab) => void;
  setMemoryTypeFilter: (v: string | null) => void;
  setMemoryPinnedOnly: (v: boolean) => void;
  setMnemosMode: (v: MnemosMode) => void;
  setMindTab: (v: MindTab) => void;
  setProfileTab: (v: ProfileTab) => void;
}

export const useViewTabStore = create<ViewTabState>((set) => ({
  memoryTab: 'Memories',
  memoryTypeFilter: null,
  memoryPinnedOnly: false,
  mnemosMode: 'browse',
  mindTab: 'Overview',
  profileTab: 'Portrait',
  setMemoryTab: (v) => set({ memoryTab: v }),
  setMemoryTypeFilter: (v) => set({ memoryTypeFilter: v }),
  setMemoryPinnedOnly: (v) => set({ memoryPinnedOnly: v }),
  setMnemosMode: (v) => set({ mnemosMode: v }),
  setMindTab: (v) => set({ mindTab: v }),
  setProfileTab: (v) => set({ profileTab: v }),
}));
