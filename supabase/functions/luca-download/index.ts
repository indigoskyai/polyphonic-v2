import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

type DownloadRequest = {
  passphrase?: unknown;
  platform?: unknown;
};

const SIGNED_URL_TTL_SECONDS = 15 * 60;

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
    if (!expectedPassphrase) {
      return json({ ok: false, error: "Luca download gate is not configured." }, 503, corsHeaders);
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
      return json({ ok: false, error: "That passphrase did not unlock the beta download." }, 401, corsHeaders);
    }

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
