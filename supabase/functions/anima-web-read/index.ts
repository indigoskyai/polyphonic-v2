// URL reading runs through Perplexity Sonar via OpenRouter — Sonar's online
// routing fetches the page itself and returns content with citations. We
// keep a generic-fetch fallback for cases where Sonar can't reach the URL
// (paywalled, rate-limited, ephemeral content).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { loadUserOpenRouterKey, perplexityRead } from "../_shared/perplexity.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ error: "Unauthorized" }, 401, req);
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const focus = typeof body?.focus === "string" ? body.focus.trim() : undefined;
    if (!url) return jsonResp({ error: "URL is required" }, 400, req);

    const userId = await resolveUserId(supabaseUrl, serviceRoleKey, token, body);
    if (!userId) return jsonResp({ error: "Unauthorized" }, 401, req);

    const apiKey = await loadUserOpenRouterKey(supabase, userId);

    console.log("Web read URL:", url.slice(0, 200));

    // Try Perplexity first — it fetches the URL itself and returns synthesized
    // content with citations. Falls back to raw fetch if Sonar can't reach it.
    if (apiKey) {
      try {
        const sonar = await perplexityRead(apiKey, url, focus);
        if (sonar.answer && sonar.answer.trim().length > 0) {
          await logActivity(supabase, userId, {
            type: "browse",
            title: `Read: ${sonar.title || url}`,
            summary: sonar.answer.slice(0, 240),
            content: { url, citations: sonar.results.slice(0, 6) },
          });

          return jsonResp({
            title: sonar.title,
            url,
            content: sonar.answer,
            summary: sonar.answer,
            citations: sonar.results,
            engine: "perplexity_sonar",
          }, 200, req);
        }
      } catch (err) {
        console.warn("[anima-web-read] sonar failed, falling back to raw fetch:", err);
      }
    }

    // Fallback path — raw fetch + tag-strip. Used when no API key is present
    // or Sonar can't reach the URL.
    const raw = await rawFetchAndExtract(url);
    if (!raw.ok) {
      return jsonResp({ error: raw.error }, raw.status, req);
    }

    await logActivity(supabase, userId, {
      type: "browse",
      title: `Read: ${raw.title || url}`,
      summary: raw.content.slice(0, 240),
      content: { url, engine: "raw_fetch_fallback" },
    });

    return jsonResp({
      title: raw.title,
      url,
      content: raw.content,
      engine: "raw_fetch_fallback",
    }, 200, req);
  } catch (e) {
    console.error("anima-web-read error:", e);
    return jsonResp({ error: "An unexpected error occurred." }, 500, req);
  }
});

async function resolveUserId(
  supabaseUrl: string,
  serviceRoleKey: string,
  token: string,
  body: any,
): Promise<string | null> {
  if (token === serviceRoleKey) {
    const explicit = typeof body?.user_id === "string" ? body.user_id : null;
    return explicit || null;
  }

  const supabaseAuth = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !data?.claims) return null;
  return (data.claims.sub as string) || null;
}

interface RawFetchSuccess {
  ok: true;
  title: string;
  content: string;
}
interface RawFetchFailure {
  ok: false;
  status: number;
  error: string;
}

async function rawFetchAndExtract(url: string): Promise<RawFetchSuccess | RawFetchFailure> {
  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Polyphonic/1.0",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      return { ok: false, status: 502, error: `Failed to fetch URL: ${response.status}` };
    }
    html = await response.text();
  } catch (err) {
    console.error("Raw fetch error:", err);
    return { ok: false, status: 502, error: "Failed to fetch the URL" };
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  let extracted = html;
  extracted = extracted.replace(/<script[\s\S]*?<\/script>/gi, "");
  extracted = extracted.replace(/<style[\s\S]*?<\/style>/gi, "");
  extracted = extracted.replace(/<[^>]+>/g, " ");
  extracted = extracted
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  extracted = extracted.replace(/\s+/g, " ").trim().slice(0, 8000);

  return { ok: true, title, content: extracted };
}

function jsonResp(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
