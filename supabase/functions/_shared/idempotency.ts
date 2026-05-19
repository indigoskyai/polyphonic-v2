// Idempotency helper for chat send. Backed by public.idempotency_keys.
// Returns cached response if key already present, otherwise records and returns null.

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TTL_HOURS = 24;

export async function getIdempotentResponse(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  scope: string,
): Promise<unknown | null> {
  const cutoff = new Date(Date.now() - TTL_HOURS * 3600_000).toISOString();
  const { data } = await supabase
    .from("idempotency_keys")
    .select("response, created_at")
    .eq("key", key)
    .eq("user_id", userId)
    .eq("scope", scope)
    .gte("created_at", cutoff)
    .maybeSingle();
  return data?.response ?? null;
}

export async function claimIdempotencyKey(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  scope: string,
): Promise<{ status: "claimed" } | { status: "cached"; response: unknown } | { status: "in_progress" }> {
  const { error } = await supabase
    .from("idempotency_keys")
    .insert({ key, user_id: userId, scope, response: null });

  if (!error) return { status: "claimed" };

  const cached = await getIdempotentResponse(supabase, key, userId, scope);
  if (cached) return { status: "cached", response: cached };
  return { status: "in_progress" };
}

export async function recordIdempotentResponse(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  scope: string,
  response: unknown,
): Promise<void> {
  await supabase.from("idempotency_keys").upsert(
    { key, user_id: userId, scope, response: response as object },
    { onConflict: "key" },
  );
}
