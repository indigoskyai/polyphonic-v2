/**
 * Shared CORS configuration for all edge functions.
 *
 * Checks the request Origin against an allowlist and returns
 * appropriate headers. Falls back to the first allowed origin
 * if no Origin header is present (e.g., server-to-server calls).
 */

const ALLOWED_ORIGINS = [
  "https://polyphonic.chat",
  "https://www.polyphonic.chat",
  "https://polyphonic-v2.lovable.app",
  "https://483efe7e-e882-4d1d-8f74-8b9b0098170f.lovableproject.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

// Local dev: any port on localhost / 127.0.0.1 over http. Vite picks 8080,
// 8081, 8082… depending on what's free, so a literal allowlist is brittle.
const LOCAL_DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

// Lovable preview/sandbox domains: id-preview--<uuid>.lovable.app,
// <slug>.lovable.app, and *.lovableproject.com. These are auto-generated per
// project/branch so we match by pattern, not literal allowlist.
const LOVABLE_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+(?:--[a-z0-9-]+)?\.lovable(?:project)?\.(?:app|com)$/i;

// Treat anything other than explicit "production" as a non-prod environment so
// preview/staging deploys keep working with localhost dev tools. In prod the
// localhost regex is disabled entirely.
const IS_PROD = (Deno.env.get("DENO_ENV") ?? Deno.env.get("ENVIRONMENT") ?? "")
  .toLowerCase() === "production";

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (!IS_PROD && LOCAL_DEV_ORIGIN.test(origin)) return true;
  return false;
}

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/**
 * Build CORS headers for a given request.
 * If the request Origin is in the allowlist, reflect it back.
 * Otherwise, use the primary production origin.
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  };
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Returns a Response if the request is a preflight, or null if not.
 */
export function handleCorsPreflightIfNeeded(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}
