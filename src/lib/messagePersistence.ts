import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type MessageInsert = Database['public']['Tables']['messages']['Insert'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];

const SESSION_REFRESH_BUFFER_MS = 90_000;

export class MessagePersistenceAuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'MessagePersistenceAuthError';
    this.cause = options?.cause;
  }
}

function isExpiringSoon(expiresAtSeconds: number | undefined): boolean {
  if (!expiresAtSeconds) return false;
  return expiresAtSeconds * 1000 - Date.now() < SESSION_REFRESH_BUFFER_MS;
}

async function ensureFreshSession(force = false): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new MessagePersistenceAuthError(`Could not read your sign-in session: ${error.message}`, { cause: error });
  }

  if (!data.session) {
    throw new MessagePersistenceAuthError('Your sign-in session expired. Please sign in again.');
  }

  if (!force && !isExpiringSoon(data.session.expires_at)) return;

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error) {
    throw new MessagePersistenceAuthError(`Could not refresh your sign-in session: ${refreshed.error.message}`, {
      cause: refreshed.error,
    });
  }
  if (!refreshed.data.session) {
    throw new MessagePersistenceAuthError('Your sign-in session expired. Please sign in again.');
  }
}

function shouldRefreshAndRetry(error: { message?: string; code?: string; status?: number } | null): boolean {
  if (!error) return false;
  const text = [error.message, error.code, String(error.status ?? '')].filter(Boolean).join(' ').toLowerCase();
  return (
    text.includes('row-level security') ||
    text.includes('jwt') ||
    text.includes('token') ||
    text.includes('auth') ||
    text.includes('permission denied') ||
    text.includes('401') ||
    text.includes('403')
  );
}

export function isMessagePersistenceAuthError(error: unknown): error is MessagePersistenceAuthError {
  return error instanceof MessagePersistenceAuthError;
}

export async function insertMessageWithFreshSession(row: MessageInsert): Promise<MessageRow> {
  await ensureFreshSession();

  const attempt = () => supabase.from('messages').insert(row).select('*').single();
  let { data, error } = await attempt();

  if (error && shouldRefreshAndRetry(error)) {
    await ensureFreshSession(true);
    ({ data, error } = await attempt());
  }

  if (error) throw error;
  if (!data) throw new Error('Message insert returned no row.');
  return data as MessageRow;
}
