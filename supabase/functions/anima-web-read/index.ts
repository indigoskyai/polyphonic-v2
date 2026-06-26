// Direct URL reader for agents.
//
// This intentionally bypasses Sonar / answer-engine synthesis. `web_search`
// can discover sources through Perplexity; `read_url` must return the fetched
// source content itself (HTML text, raw HTML, JSON, plain text, etc.) so agents
// can verify pages that are not indexed or that Sonar might paraphrase wrongly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { directFetchAndExtract } from "../_shared/direct-url-read.ts";

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
    const format = typeof body?.format === "string" ? body.format : undefined;
    const maxChars = typeof body?.max_chars === "number" ? body.max_chars : undefined;
    if (!url) return jsonResp({ error: "URL is required" }, 400, req);

    const userId = await resolveUserId(supabaseUrl, serviceRoleKey, token, body);
    if (!userId) return jsonResp({ error: "Unauthorized" }, 401, req);

    console.log("Web read URL:", url.slice(0, 200));

    const raw = await directFetchAndExtract(url, { format, maxChars });
    if (!raw.ok) {
      return jsonResp({ error: raw.error }, raw.status, req);
    }

    await logActivity(supabase, userId, {
      type: "browse",
      title: `Read: ${raw.title || raw.finalUrl || url}`,
      summary: raw.content.slice(0, 240),
      content: {
        url,
        final_url: raw.finalUrl,
        engine: "direct_fetch",
        status: raw.status,
        content_type: raw.contentType,
        truncated: raw.truncated,
      },
    });

    return jsonResp({
      title: raw.title,
      url,
      final_url: raw.finalUrl,
      status: raw.status,
      content_type: raw.contentType,
      detected_format: raw.detectedFormat,
      format: raw.format,
      content: raw.content,
      raw_excerpt: raw.rawExcerpt,
      truncated: raw.truncated,
      bytes_read: raw.bytesRead,
      chars_returned: raw.charsReturned,
      focus,
      engine: "direct_fetch",
      synthesis: false,
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
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

function jsonResp(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
