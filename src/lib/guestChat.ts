import { supabase } from '@/integrations/supabase/client';

export const LANDING_PROMPT_KEY = 'polyphonic_landing_prompt';
export const LANDING_AUTOSEND_KEY = 'polyphonic_landing_autosend';
export const LANDING_CHAT_TRANSITION_KEY = 'polyphonic_landing_chat_transition';
const GUEST_UNAVAILABLE_MESSAGE =
  'Free Luca chat is temporarily unavailable. Please try again a little later.';

function stashLandingHandoff(prompt: string): void {
  sessionStorage.setItem(LANDING_PROMPT_KEY, prompt.trim());
  sessionStorage.setItem(LANDING_AUTOSEND_KEY, '1');
  sessionStorage.setItem(LANDING_CHAT_TRANSITION_KEY, '1');
}

function clearLandingHandoff(): void {
  sessionStorage.removeItem(LANDING_PROMPT_KEY);
  sessionStorage.removeItem(LANDING_AUTOSEND_KEY);
  sessionStorage.removeItem(LANDING_CHAT_TRANSITION_KEY);
}

function normalizeGuestError(message?: string): string {
  const lower = (message || '').toLowerCase();
  if (
    lower.includes('anonymous') ||
    lower.includes('disabled') ||
    lower.includes('row-level security') ||
    lower.includes('rls')
  ) {
    return GUEST_UNAVAILABLE_MESSAGE;
  }
  return message || GUEST_UNAVAILABLE_MESSAGE;
}

async function ensureSessionUserId(): Promise<string> {
  const current = await supabase.auth.getSession();
  if (current.data.session?.user?.id) return current.data.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(normalizeGuestError(error.message));
  const userId = data.user?.id || data.session?.user?.id;
  if (!userId) throw new Error(GUEST_UNAVAILABLE_MESSAGE);
  return userId;
}

export async function startGuestChat(prompt: string): Promise<string> {
  stashLandingHandoff(prompt);
  try {
    const userId = await ensureSessionUserId();
    const { data, error } = await supabase
      .from('threads')
      .insert({ user_id: userId, agent_id: 'luca' })
      .select('id')
      .single();

    if (error) throw new Error(normalizeGuestError(error.message));
    if (!data?.id) throw new Error(GUEST_UNAVAILABLE_MESSAGE);
    return data.id;
  } catch (err) {
    clearLandingHandoff();
    throw err;
  }
}

export function readLandingPrompt(): string {
  try {
    const stashed = sessionStorage.getItem(LANDING_PROMPT_KEY) || '';
    if (stashed) sessionStorage.removeItem(LANDING_PROMPT_KEY);
    return stashed;
  } catch {
    return '';
  }
}

export function consumeLandingAutosendFlag(): boolean {
  try {
    const flag = sessionStorage.getItem(LANDING_AUTOSEND_KEY);
    if (flag) sessionStorage.removeItem(LANDING_AUTOSEND_KEY);
    return flag === '1';
  } catch {
    return false;
  }
}

export function readLandingChatTransitionFlag(): boolean {
  try {
    return sessionStorage.getItem(LANDING_CHAT_TRANSITION_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearLandingChatTransitionFlag(): void {
  try {
    sessionStorage.removeItem(LANDING_CHAT_TRANSITION_KEY);
  } catch {
    // ignore unavailable storage
  }
}
