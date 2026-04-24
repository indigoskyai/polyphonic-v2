import { create } from 'zustand';

export type AttachmentStatus = 'pending' | 'uploading' | 'ready' | 'error';

export interface Attachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  status: AttachmentStatus;
  url?: string;
  thumbnail?: string;
}

interface AttachmentState {
  pending: Attachment[];
  add: (files: File[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  setStatus: (id: string, status: AttachmentStatus, patch?: Partial<Attachment>) => void;
}

function genId(): string {
  return `att-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

export const useAttachmentStore = create<AttachmentState>((set) => ({
  pending: [],

  add: (files) => set((s) => ({
    pending: [
      ...s.pending,
      ...files.map((f): Attachment => ({
        id: genId(),
        name: f.name,
        size: f.size,
        mime: f.type || 'application/octet-stream',
        status: 'pending',
      })),
    ],
  })),

  remove: (id) => set((s) => ({ pending: s.pending.filter((a) => a.id !== id) })),

  clear: () => set({ pending: [] }),

  setStatus: (id, status, patch) => set((s) => ({
    pending: s.pending.map((a) => (a.id === id ? { ...a, ...patch, status } : a)),
  })),
}));
