import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

type DownloadRequest = {
  passphrase?: unknown;
  platform?: unknown;
};

const SIGNED_URL_TTL_SECONDS = 15 * 60;
const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type AttemptBucket = {
  count: number;
  resetAt: number;
};

const failedAttempts = new Map<string, AttemptBucket>();

function json(payload: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown-ip";
  const ua = req.headers.get("user-agent") || "unknown-agent";
  return `${ip}:${ua.slice(0, 120)}`;
}

function readAttemptBucket(key: string): AttemptBucket {
  const now = Date.now();
  const current = failedAttempts.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + FAILED_ATTEMPT_WINDOW_MS };
    failedAttempts.set(key, fresh);
    return fresh;
  }
  return current;
}

function retryAfterSeconds(bucket: AttemptBucket): number {
  return Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
}

function recordFailedAttempt(key: string): AttemptBucket {
  const bucket = readAttemptBucket(key);
  bucket.count += 1;
  failedAttempts.set(key, bucket);
  return bucket;
}

function clearFailedAttempts(key: string) {
  failedAttempts.delete(key);
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function passphraseMatches(candidate: string, expected: string): Promise<boolean> {
  if (!candidate || !expected) return false;
  const [candidateHash, expectedHash] = await Promise.all([
    sha256Hex(candidate),
    sha256Hex(expected),
  ]);
  return constantTimeEqual(candidateHash, expectedHash);
}

function safeFileName(value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "Luca.dmg";
  return trimmed.replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 120) || "Luca.dmg";
}

async function resolveDownloadUrl() {
  const directUrl = normalize(Deno.env.get("LUCA_DOWNLOAD_URL"));
  const bucket = normalize(Deno.env.get("LUCA_DOWNLOAD_STORAGE_BUCKET"));
  const path = normalize(Deno.env.get("LUCA_DOWNLOAD_STORAGE_PATH"));
  const fileName = safeFileName(Deno.env.get("LUCA_DOWNLOAD_FILE_NAME"));

  if (bucket && path) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase storage signing is not configured.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: fileName });

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Could not create the Luca download link.");
    }

    return {
      downloadUrl: data.signedUrl,
      fileName,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      source: "storage",
    };
  }

  if (directUrl) {
    const parsed = new URL(directUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("LUCA_DOWNLOAD_URL must be an http(s) URL.");
    }
    return {
      downloadUrl: parsed.toString(),
      fileName,
      expiresInSeconds: null,
      source: "url",
    };
  }

  throw new Error("Luca download is not configured.");
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405, corsHeaders);
  }

  try {
    const expectedPassphrase = normalize(Deno.env.get("LUCA_DOWNLOAD_PASSPHRASE"));
    const disabled = normalize(Deno.env.get("LUCA_DOWNLOAD_DISABLED"));
    if (disabled === "1" || disabled.toLowerCase() === "true") {
      return json({ ok: false, error: "Luca beta downloads are temporarily paused." }, 503, corsHeaders);
    }
    if (!expectedPassphrase) {
      return json({ ok: false, error: "Luca download gate is not configured." }, 503, corsHeaders);
    }

    const key = clientKey(req);
    const bucket = readAttemptBucket(key);
    if (bucket.count >= MAX_FAILED_ATTEMPTS) {
      return json(
        { ok: false, error: "Too many attempts. Try again shortly.", retryAfterSeconds: retryAfterSeconds(bucket) },
        429,
        corsHeaders,
      );
    }

    let body: DownloadRequest;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid request body." }, 400, corsHeaders);
    }

    const passphrase = normalize(body.passphrase);
    const platform = normalize(body.platform) || "macos-arm64";
    if (platform !== "macos-arm64") {
      return json({ ok: false, error: "Only the Apple Silicon macOS beta is available right now." }, 400, corsHeaders);
    }

    const allowed = await passphraseMatches(passphrase, expectedPassphrase);
    if (!allowed) {
      const failed = recordFailedAttempt(key);
      console.warn("[luca-download] failed passphrase attempt", { count: failed.count, retryAfterSeconds: retryAfterSeconds(failed) });
      await sleep(350);
      if (failed.count >= MAX_FAILED_ATTEMPTS) {
        return json(
          { ok: false, error: "Too many attempts. Try again shortly.", retryAfterSeconds: retryAfterSeconds(failed) },
          429,
          corsHeaders,
        );
      }
      return json({ ok: false, error: "That passphrase did not unlock the beta download." }, 401, corsHeaders);
    }

    clearFailedAttempts(key);
    const resolved = await resolveDownloadUrl();
    return json({ ok: true, ...resolved }, 200, corsHeaders);
  } catch (err) {
    console.error("[luca-download]", err);
    return json(
      { ok: false, error: err instanceof Error ? err.message : "Could not unlock the Luca download." },
      500,
      corsHeaders,
    );
  }
});
