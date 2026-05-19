// Per-user daily quota helper. Backed by public.daily_usage + increment_daily_usage RPC.
// Returns { allowed, current, limit }. Throws QuotaExceededError when over.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { QuotaExceededError } from "./errors.ts";

export type QuotaScope =
  | "chat-message"
  | "guest-chat-message"
  | "free-chat-message"
  | "byok-chat-message"
  | "image-generation"
  | "web-search";

export const DEFAULT_QUOTAS: Record<QuotaScope, number> = {
  "chat-message": 500,
  "guest-chat-message": 20,
  "free-chat-message": 50,
  "byok-chat-message": 500,
  "image-generation": 25,
  "web-search": 100,
};

let _client: SupabaseClient | null = null;
function svc(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return _client;
}

export async function checkAndIncrement(
  userId: string,
  scope: QuotaScope,
  limit: number = DEFAULT_QUOTAS[scope],
): Promise<{ current: number; limit: number }> {
  const { data, error } = await svc().rpc("increment_daily_usage", {
    p_user_id: userId,
    p_scope: scope,
    p_limit: limit,
  });
  if (error) {
    console.warn(`[dailyQuota] RPC failed for ${scope}:`, error.message);
    // Fail-open on infrastructure errors — we don't want to block users on a counter outage.
    return { current: 0, limit };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { current: 0, limit };
  if (!row.allowed) {
    throw new QuotaExceededError(scope, row.day_limit ?? limit, row.current_count ?? limit);
  }
  return { current: row.current_count ?? 0, limit: row.day_limit ?? limit };
}
