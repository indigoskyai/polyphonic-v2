import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { LucaGuideAction, LucaGuideContext, LucaGuideMessage } from '@/lib/lucaGuide';
import { sanitizeGuideAction } from '@/lib/lucaGuide';

interface LucaGuideState {
  open: boolean;
  messages: LucaGuideMessage[];
  sending: boolean;
  error: string | null;
  activeTargetId: string | null;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  clear: () => void;
  clearHighlight: () => void;
  highlight: (targetId: string | null) => void;
  send: (content: string, context: LucaGuideContext) => Promise<void>;
}

const WELCOME_MESSAGE: LucaGuideMessage = {
  id: 'guide-welcome',
  role: 'assistant',
  content: "i'm here. ask me about this screen, or try: “show me where setup starts,” “what does this page do,” or “how do agents and memory fit together?”",
  createdAt: new Date(0).toISOString(),
};

function nowMessage(role: LucaGuideMessage['role'], content: string, actions?: LucaGuideAction[]): LucaGuideMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    actions,
    createdAt: new Date().toISOString(),
  };
}

function readFunctionError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export const useLucaGuideStore = create<LucaGuideState>((set, get) => ({
  open: false,
  messages: [WELCOME_MESSAGE],
  sending: false,
  error: null,
  activeTargetId: null,

  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  clear: () => set({ messages: [WELCOME_MESSAGE], error: null, activeTargetId: null }),
  clearHighlight: () => set({ activeTargetId: null }),
  highlight: (targetId) => set({ activeTargetId: targetId }),

  send: async (content, context) => {
    const trimmed = content.trim();
    if (!trimmed || get().sending) return;

    const userMessage = nowMessage('user', trimmed);
    set((s) => ({
      messages: [...s.messages, userMessage],
      sending: true,
      error: null,
    }));

    try {
      const history = get().messages
        .filter((message) => message.id !== WELCOME_MESSAGE.id)
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content }));

      const { data, error } = await supabase.functions.invoke('luca-app-guide', {
        body: {
          context,
          messages: history,
        },
      });

      if (error || (data && typeof data === 'object' && 'error' in data)) {
        throw new Error(error?.message ?? readFunctionError(data, 'Luca guide is unavailable'));
      }

      const reply =
        typeof data?.reply === 'string' && data.reply.trim()
          ? data.reply.trim()
          : "i'm here, but i didn't get a usable guide response back.";
      const actions = Array.isArray(data?.actions)
        ? data.actions
            .map((action: LucaGuideAction) => sanitizeGuideAction(action))
            .filter(Boolean) as LucaGuideAction[]
        : undefined;

      set((s) => ({
        messages: [...s.messages, nowMessage('assistant', reply, actions?.length ? actions : undefined)],
        sending: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Luca guide is unavailable';
      set((s) => ({
        messages: [
          ...s.messages,
          nowMessage(
            'assistant',
            "i couldn't reach the guide runtime from here yet. the overlay is still working locally, but this needs the luca-app-guide edge function deployed before i can answer from live context.",
          ),
        ],
        sending: false,
        error: message,
      }));
    }
  },
}));
