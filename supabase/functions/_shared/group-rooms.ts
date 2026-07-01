import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AuthError, ForbiddenError, ValidationError } from "./errors.ts";

export const GROUP_ATTACHMENTS_BUCKET = "group-attachments";
export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

export type JsonObject = Record<string, unknown>;

export interface AuthedContext {
  userId: string;
  email?: string | null;
  userClient: SupabaseClient;
  admin: SupabaseClient;
  authHeader: string;
}

export interface ActiveMember {
  id: string;
  room_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  state: "active" | "left" | "removed" | "invited";
  joined_at: string;
  muted?: boolean;
  can_see_history_before_join?: boolean;
  display_snapshot?: JsonObject;
}

export interface GroupAgentRow {
  id: string;
  room_id: string;
  owner_user_id: string;
  agent_id: string;
  display_name: string;
  avatar_color?: string | null;
  mention_policy: "owner" | "members" | "blocked";
  state: "active" | "removed";
  added_at: string;
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server misconfigured: missing Supabase service credentials");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function userClientForRequest(req: Request): { client: SupabaseClient; authHeader: string } {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) throw new AuthError("Missing Authorization header");
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Server misconfigured: missing Supabase anon credentials");
  return {
    authHeader,
    client: createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export async function requireAuthedContext(req: Request): Promise<AuthedContext> {
  const { client, authHeader } = userClientForRequest(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AuthError();
  return {
    userId: data.user.id,
    email: data.user.email,
    userClient: client,
    admin: adminClient(),
    authHeader,
  };
}

export async function readJson(req: Request): Promise<JsonObject> {
  try {
    const data = await req.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return data as JsonObject;
  } catch {
    return {};
  }
}

export function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeHandle(value: unknown): string | null {
  const raw = optionalString(value);
  if (!raw) return null;
  return raw.replace(/^@/, "").trim().toLowerCase();
}

export function normalizeMentionKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function extractMentionKeys(content: string): string[] {
  const keys = new Set<string>();
  const re = /(^|[\s([{])@([a-zA-Z0-9][a-zA-Z0-9_-]{1,62})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const key = normalizeMentionKey(match[2] ?? "");
    if (key) keys.add(key);
  }
  return [...keys];
}

export function makeAgentHandle(agent: Pick<GroupAgentRow, "agent_id" | "display_name">): string {
  return normalizeMentionKey(agent.agent_id) || normalizeMentionKey(agent.display_name);
}

export async function loadActiveMember(
  admin: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<ActiveMember> {
  const { data, error } = await admin
    .from("group_room_members")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("state", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ForbiddenError("You are not an active member of this room.");
  return data as ActiveMember;
}

export async function requireRoomManager(
  admin: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<ActiveMember> {
  const member = await loadActiveMember(admin, roomId, userId);
  if (member.role !== "owner" && member.role !== "admin") {
    throw new ForbiddenError("Only room admins can do that.");
  }
  return member;
}

export async function loadProfileSnapshot(admin: SupabaseClient, userId: string): Promise<JsonObject> {
  const [{ data: profile }, { data: handle }] = await Promise.all([
    admin.from("profiles").select("display_name, avatar_url").eq("user_id", userId).maybeSingle(),
    admin.from("handles").select("handle").eq("owner_user_id", userId).eq("owner_kind", "user").maybeSingle(),
  ]);
  const displayName =
    typeof profile?.display_name === "string" && profile.display_name.trim()
      ? profile.display_name.trim()
      : handle?.handle
        ? `@${handle.handle}`
        : "Member";
  return {
    display_name: displayName,
    avatar_url: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
    handle: typeof handle?.handle === "string" ? handle.handle : null,
  };
}

export async function resolveUserByHandle(admin: SupabaseClient, handle: string): Promise<string | null> {
  const normalized = normalizeHandle(handle);
  if (!normalized) return null;
  const { data, error } = await admin
    .from("handles")
    .select("owner_user_id")
    .eq("handle", normalized)
    .eq("owner_kind", "user")
    .maybeSingle();
  if (error) throw error;
  return typeof data?.owner_user_id === "string" ? data.owner_user_id : null;
}

export function createInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function appOrigin(req: Request): string {
  const origin = req.headers.get("Origin");
  if (origin && /^https?:\/\//.test(origin)) return origin;
  return Deno.env.get("SITE_URL") || "https://polyphonic.chat";
}

export async function insertSystemMessage(
  admin: SupabaseClient,
  roomId: string,
  content: string,
  metadata: JsonObject = {},
): Promise<void> {
  const { error } = await admin.from("group_messages").insert({
    room_id: roomId,
    role: "system",
    content,
    metadata,
  });
  if (error) console.warn("[group-rooms] system message insert failed:", error.message);
}

export async function notifyRoomMembers(
  admin: SupabaseClient,
  roomId: string,
  actorUserId: string,
  entry: {
    type: string;
    title: string;
    summary?: string;
    content?: JsonObject;
    includeActor?: boolean;
    critical?: boolean;
  },
): Promise<void> {
  const { data, error } = await admin
    .from("group_room_members")
    .select("user_id, muted")
    .eq("room_id", roomId)
    .eq("state", "active");
  if (error || !data) {
    if (error) console.warn("[group-rooms] member notification lookup failed:", error.message);
    return;
  }

  const rows = data
    .filter((member: { user_id: string; muted?: boolean }) =>
      (entry.includeActor || member.user_id !== actorUserId) && (entry.critical || !member.muted)
    )
    .map((member: { user_id: string }) => ({
      user_id: member.user_id,
      agent_id: "luca",
      activity_type: entry.type,
      title: entry.title,
      summary: entry.summary ?? null,
      content: { room_id: roomId, ...(entry.content ?? {}) },
      source: "group-room",
      severity: entry.critical ? "important" : "notable",
      surface_to_user: true,
    }));

  if (!rows.length) return;
  const { error: insertError } = await admin.from("entity_activity_log").insert(rows);
  if (insertError) console.warn("[group-rooms] activity insert failed:", insertError.message);
}

export function roomUrl(origin: string, roomId: string): string {
  return `${origin.replace(/\/$/, "")}/groups/${roomId}`;
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/groups?invite=${encodeURIComponent(token)}`;
}
