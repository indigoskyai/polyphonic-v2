import { create } from 'zustand';
import type { AttachmentDescriptor, AttachmentKind, AttachmentStatus as DurableStatus } from '@/types/attachments';

export type AttachmentStatus = 'pending' | DurableStatus;

export interface Attachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  status: AttachmentStatus;
  file?: File;
  url?: string;
  thumbnail?: string;
  path?: string;
  error?: string;
  progress?: number;
  descriptor?: AttachmentDescriptor;
  kind?: AttachmentKind;
  abortController?: AbortController;
}

interface AttachmentState {
  pending: Attachment[];
  add: (files: File[]) => Attachment[];
  remove: (id: string) => void;
  clear: () => void;
  setStatus: (id: string, status: AttachmentStatus, patch?: Partial<Attachment>) => void;
  retry: (id: string) => void;
}

function genId(): string {
  return `att-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

export const useAttachmentStore = create<AttachmentState>((set) => ({
  pending: [],

  add: (files) => {
    const added = files.map((f): Attachment => ({
        id: genId(),
        name: f.name,
        size: f.size,
        mime: f.type || 'application/octet-stream',
        status: 'pending',
        file: f,
      }));
    set((s) => ({ pending: [...s.pending, ...added] }));
    return added;
  },

  remove: (id) => set((s) => ({ pending: s.pending.filter((a) => a.id !== id) })),

  clear: () => set({ pending: [] }),

  setStatus: (id, status, patch) => set((s) => ({
    pending: s.pending.map((a) => (a.id === id ? { ...a, ...patch, status } : a)),
  })),

  retry: (id) => set((s) => ({
    pending: s.pending.map((a) => a.id === id
      ? { ...a, status: 'pending', progress: 0, error: undefined, descriptor: undefined, abortController: undefined }
      : a),
  })),
}));
