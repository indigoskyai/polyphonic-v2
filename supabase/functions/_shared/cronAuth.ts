// Guard for "cron-or-self" edge functions:
// - Service role bearer (cron / pg_net) → allowed for any user_id (or null = batch).
// - Authenticated user bearer → allowed only when target_user_id matches their auth.uid().
// - Anything else → 401.
//
// Returns { ok: true, mode: 'service'|'user', userId: string|null } or { ok: false, status, error }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CronAuthResult =
  | { ok: true; mode: "service" | "user"; userId: string | null }
  | { ok: false; status: number; error: string };

export async function authorizeCronOrSelf(
  req: Request,
  targetUserId: string | null | undefined,
): Promise<CronAuthResult> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization" };
  }
  const token = authHeader.replace("Bearer ", "");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === serviceKey) {
    return { ok: true, mode: "service", userId: targetUserId ?? null };
  }

  // Otherwise must be an authenticated user JWT, and target (if given) must match.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const uid = data.user.id;
  if (targetUserId && targetUserId !== uid) {
    return { ok: false, status: 403, error: "Forbidden: cannot target another user" };
  }
  return { ok: true, mode: "user", userId: uid };
}
