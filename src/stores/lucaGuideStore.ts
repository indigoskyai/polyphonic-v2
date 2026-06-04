import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { LucaGuideAction, LucaGuideContext, LucaGuideMessage } from '@/lib/lucaGuide';
import { routeInfo, sanitizeGuideAction, targetsForPath } from '@/lib/lucaGuide';

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
  send: (content: string, context?: Partial<LucaGuideContext>) => Promise<void>;
}

const WELCOME_MESSAGE: LucaGuideMessage = {
  id: 'guide-welcome',
  role: 'assistant',
  content: "hey. i'm the Polyphonic Guide. i can stay with you while you look around, help you connect OpenRouter, or point you toward the first place that matters. what would you like to do first?",
  createdAt: new Date(0).toISOString(),
};
const GUIDE_RESPONSE_TIMEOUT_MS = 12000;

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

export function sanitizeGuideReply(reply: string): string {
  return reply
    .replace(/\b(I\s+am|I'm|I’m)\s+Luca\b[^.!?\n]*(?:[.!?]|$)/gi, "I'm the Polyphonic Guide.")
    .replace(/\bLuca\s+here\b[^.!?\n]*(?:[.!?]|$)/gi, 'Polyphonic Guide here.')
    .replace(/\byour\s+guide,?\s+Luca\b/gi, 'the Polyphonic Guide')
    .replace(/\byour\s+guide\s+inside\s+Polyphonic\b/gi, 'the Polyphonic Guide')
    .replace(/\bWelcome\s+to\s+Polyphonic[.!]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function guideAction(target: string, label: string): LucaGuideAction {
  return { type: 'navigate', target, label };
}

function normalizeGuideContext(context?: Partial<LucaGuideContext>): LucaGuideContext {
  const browserPath =
    typeof window !== 'undefined' && window.location?.pathname
      ? window.location.pathname
      : '/chat';
  const browserSearch =
    typeof window !== 'undefined' && window.location?.search
      ? window.location.search
      : '';
  const path = context?.path?.trim() || browserPath;
  const search = context?.search ?? browserSearch;
  const info = routeInfo(path);

  return {
    path,
    search,
    pageTitle: context?.pageTitle?.trim() || info.pageTitle,
    routeFamily: context?.routeFamily?.trim() || info.routeFamily,
    summary: context?.summary?.trim() || info.summary,
    activeAgentId: context?.activeAgentId?.trim() || 'luca',
    activeAgentName: context?.activeAgentName?.trim() || 'Luca',
    interfaceMode: context?.interfaceMode || 'guided',
    interfaceModeSummary: context?.interfaceModeSummary?.trim() || 'A guided app surface for getting oriented without needing the full studio at once.',
    interfaceModeInstruction: context?.interfaceModeInstruction?.trim() || 'Start with the simplest visible path, and treat deeper Polyphonic features as optional.',
    currentThreadId: context?.currentThreadId ?? null,
    availableTargets: Array.isArray(context?.availableTargets) ? context.availableTargets : targetsForPath(path),
  };
}

function localGuideFallback(content: string, context: LucaGuideContext): { reply: string; actions?: LucaGuideAction[] } {
  const lower = content.toLowerCase();
  const uncertain = /\b(idk|don't know|dont know|not sure|confused|lost|start|first|begin|hello|hi|hey)\b/.test(lower);
  const wantsTour = /\b(show|tour|around|walk|where|what is this|what can|explain)\b/.test(lower);
  const wantsKey = /\b(openrouter|api key|model|connect|setup|set up)\b/.test(lower);
  const wantsAgent = /\b(agent|create|make|build|forge|entity|companion)\b/.test(lower);
  const wantsImport = /\b(import|migrate|bring|existing|export|openclaw)\b/.test(lower);
  const wantsMemory = /\b(memory|journal|notebook|mind|mnemos|profile)\b/.test(lower);

  if (wantsKey) {
    return {
      reply: "yes. the first practical move is OpenRouter: that gives Luca and any custom agents a model account to speak through. i can take you to Models, and then we can come back to creating, importing, or just looking around.",
      actions: [guideAction('/settings/models', 'Open Models')],
    };
  }

  if (wantsImport) {
    return {
      reply: "we can do that carefully. bringing an existing companion into Polyphonic starts with import, but Luca can only do the deeper migration work after OpenRouter is connected. i can show you the import surface or the model setup first.",
      actions: [guideAction('/import', 'Open Import'), guideAction('/settings/models', 'Connect OpenRouter')],
    };
  }

  if (wantsAgent) {
    return {
      reply: "that is one of the main things Polyphonic is for: building a digital entity with its own documents, notebook, memory, and inner-life substrate. the smooth path is: connect OpenRouter, then Luca helps shape the agent with you instead of making you fill out a form.",
      actions: [guideAction('/settings/models', 'Connect OpenRouter'), guideAction('/settings/agents', 'View Agents')],
    };
  }

  if (wantsMemory) {
    return {
      reply: "the memory side has three useful doors: Notebook is the readable feed, Memory is the substrate browser, and Mind is the advanced diagnostic view. if you want the least technical path, start with Notebook.",
      actions: [guideAction('/journal', 'Open Notebook'), guideAction('/memory', 'Open Memory'), guideAction('/mind', 'Open Mind')],
    };
  }

  if (wantsTour || uncertain) {
    return {
      reply: `we can start gently. you're on ${context.pageTitle}, which is ${context.summary.toLowerCase()} the simplest first choice is whether you want to look around, connect OpenRouter so Luca can talk, create a new agent, or bring in someone you already know.`,
      actions: [
        guideAction('/settings/models', 'Connect OpenRouter'),
        guideAction('/journal', 'Open Notebook'),
        guideAction('/memory', 'Open Memory'),
        guideAction('/settings/agents', 'View Agents'),
      ],
    };
  }

  return {
    reply: `i'm with you. from ${context.pageTitle}, i can help you find the right next surface, explain what you're seeing, or help decide whether to start with setup, agents, notebook, or memory. what are you trying to do?`,
  };
}

async function invokeGuideWithTimeout(
  context: LucaGuideContext,
  messages: Array<{ role: LucaGuideMessage['role']; content: string }>,
) {
  const invokePromise = supabase.functions.invoke('luca-app-guide', {
    body: { context, messages },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('guide_timeout')), GUIDE_RESPONSE_TIMEOUT_MS);
  });

  return Promise.race([invokePromise, timeoutPromise]);
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
    const guideContext = normalizeGuideContext(context);

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

      const { data, error } = await invokeGuideWithTimeout(guideContext, history);

      if (error || (data && typeof data === 'object' && 'error' in data)) {
        throw new Error(error?.message ?? readFunctionError(data, 'Polyphonic Guide is unavailable'));
      }

      const fallback = localGuideFallback(trimmed, guideContext);
      const reply =
        typeof data?.reply === 'string' && sanitizeGuideReply(data.reply).trim()
          ? sanitizeGuideReply(data.reply)
          : fallback.reply;
      const actions = Array.isArray(data?.actions)
        ? data.actions
            .map((action: LucaGuideAction) => sanitizeGuideAction(action))
            .filter(Boolean) as LucaGuideAction[]
        : undefined;

      set((s) => ({
        messages: [...s.messages, nowMessage('assistant', reply, actions?.length ? actions : fallback.actions)],
        sending: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Polyphonic Guide is unavailable';
      const fallback = localGuideFallback(trimmed, guideContext);
      set((s) => ({
        messages: [
          ...s.messages,
          nowMessage('assistant', fallback.reply, fallback.actions),
        ],
        sending: false,
        error: message,
      }));
    }
  },
}));
