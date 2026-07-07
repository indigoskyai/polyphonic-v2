import { create } from 'zustand';

export type DrawerKey =
  | 'notifications'
  | 'activity-timeline'
  | 'thread-detail'
  | 'memory-detail'
  | 'continuity-trace'
  | 'agent-inspector'
  | 'agent-dialogue'
  | 'observer'
  | null;

interface DrawerState {
  active: DrawerKey;
  payload: Record<string, unknown> | null;
  open: (key: Exclude<DrawerKey, null>, payload?: Record<string, unknown>) => void;
  close: () => void;
}

export const useDrawerStore = create<DrawerState>((set) => ({
  active: null,
  payload: null,
  open: (key, payload = {}) => set({ active: key, payload }),
  close: () => set({ active: null, payload: null }),
}));
