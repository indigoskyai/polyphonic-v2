import { create } from 'zustand';

export interface PermissionAffectedItem {
  label: string;
  destructive?: boolean;
}

export interface DestructiveRequest {
  title: string;
  subtitle: string;
  affected: PermissionAffectedItem[];
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface PermissionModalState {
  active: DestructiveRequest | null;
  requestDestructive: (req: DestructiveRequest) => void;
  dismiss: (canceled?: boolean) => void;
}

export const usePermissionModalStore = create<PermissionModalState>((set, get) => ({
  active: null,

  requestDestructive: (req) => set({ active: req }),

  dismiss: (canceled = false) => {
    const { active } = get();
    if (canceled && active?.onCancel) active.onCancel();
    set({ active: null });
  },
}));
