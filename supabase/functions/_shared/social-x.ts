import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "./cors.ts";

export const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_API_BASE = "https://api.x.com/2";

export const X_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface AuthedContext {
  corsHeaders: Record<string, string>;
  admin: ReturnType<typeof createClient>;
  userId: string;
  userEmail: string;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

export async function requireUser(req: Request): Promise<AuthedContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(req, { error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse(req, { error: "Supabase environment is not configured" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return jsonResponse(req, { error: "Unauthorized" }, 401);

  return {
    corsHeaders: getCorsHeaders(req),
    admin: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }),
    userId: data.user.id,
    userEmail: data.user.email ?? "",
  };
}

export async function assertEditableAgent(
  admin: ReturnType<typeof createClient>,
  userId: string,
  agentId: string,
): Promise<{ ok: true; agent: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const { data, error } = await admin
    .from("agent_configs")
    .select("id, name, role, locked, is_system, pending")
    .eq("user_id", userId)
    .eq("id", agentId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: "Could not verify agent ownership" };
  if (!data) return { ok: false, status: 404, error: "Agent not found" };
  if (data.locked || data.is_system || data.pending) {
    return { ok: false, status: 403, error: "X channels can only be attached to editable custom agents" };
  }
  return { ok: true, agent: data as Record<string, unknown> };
}

export function defaultXPolicy() {
  return {
    approval_mode: "approval_required",
    cadence_per_day: 2,
    topics: [] as string[],
    prohibited_topics: [] as string[],
    human_account_handle: "",
    bot_disclosure_confirmed: false,
    automated_label_confirmed: false,
    no_spam_confirmed: false,
    x_rules_acknowledged_at: null as string | null,
  };
}

export function defaultXBilling() {
  return {
    mode: "subscription_credits",
    post_cost_credits: 1,
    daily_spend_limit_credits: 6,
  };
}

export function mergePolicy(input: unknown) {
  const base = defaultXPolicy();
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;
  const value = input as Record<string, unknown>;
  return {
    ...base,
    approval_mode: value.approval_mode === "autopilot" ? "autopilot" : "approval_required",
    cadence_per_day: clampInt(value.cadence_per_day, 1, 24, base.cadence_per_day),
    topics: stringList(value.topics, 16),
    prohibited_topics: stringList(value.prohibited_topics, 24),
    human_account_handle: cleanString(value.human_account_handle, 32),
    bot_disclosure_confirmed: value.bot_disclosure_confirmed === true,
    automated_label_confirmed: value.automated_label_confirmed === true,
    no_spam_confirmed: value.no_spam_confirmed === true,
    x_rules_acknowledged_at:
      typeof value.x_rules_acknowledged_at === "string" ? value.x_rules_acknowledged_at : null,
  };
}

export function mergeBilling(input: unknown) {
  const base = defaultXBilling();
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;
  const value = input as Record<string, unknown>;
  return {
    ...base,
    mode: value.mode === "mnemos_credits" ? "mnemos_credits" : "subscription_credits",
    post_cost_credits: clampNumber(value.post_cost_credits, 0.1, 100, base.post_cost_credits),
    daily_spend_limit_credits: clampNumber(
      value.daily_spend_limit_credits,
      1,
      500,
      base.daily_spend_limit_credits,
    ),
  };
}

export function policyAllowsPosting(policy: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  if (policy.bot_disclosure_confirmed !== true) {
    return { ok: false, error: "Confirm the bot disclosure before posting" };
  }
  if (policy.automated_label_confirmed !== true) {
    return { ok: false, error: "Confirm the X automated-account label before posting" };
  }
  if (policy.no_spam_confirmed !== true) {
    return { ok: false, error: "Confirm the no-spam operating rule before posting" };
  }
  if (typeof policy.x_rules_acknowledged_at !== "string") {
    return { ok: false, error: "Acknowledge the current X automation rules before posting" };
  }
  return { ok: true };
}

export function sanitizePostText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, 280);
}

export async function randomBase64Url(bytes = 32): Promise<string> {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return bytesToBase64Url(array);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function encryptSocialToken(token: string): Promise<string> {
  const key = await encryptionKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoder.encode(token) as BufferSource,
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSocialToken(payload: string): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Unsupported token payload");
  const key = await encryptionKey();
  const iv = base64UrlToBytes(parts[1]);
  const body = base64UrlToBytes(parts[2]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    body as BufferSource,
  );
  return decoder.decode(decrypted);
}

export async function refreshXToken(refreshToken: string) {
  const clientId = Deno.env.get("X_CLIENT_ID");
  if (!clientId) throw new Error("X_CLIENT_ID is not configured");
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const clientSecret = Deno.env.get("X_CLIENT_SECRET");
  if (clientSecret) headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || data?.error || "X refresh failed");
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 24) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must be configured before storing X tokens");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim().slice(0, 80);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}
