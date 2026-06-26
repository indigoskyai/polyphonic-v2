// Web search runs through Perplexity Sonar via OpenRouter.
// See `_shared/perplexity.ts` for the engine; this function just resolves
// auth, calls the helper, logs the activity row, and returns.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { loadUserOpenRouterKey, perplexitySearch } from "../_shared/perplexity.ts";

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
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return jsonResp({ error: "Query is required" }, 400, req);

    // Resolve effective user — JWT first, then explicit user_id from body for
    // service-role callers (subagent-run, scheduled-task-run, etc.). Without
    // this fallback, service-role calls couldn't fetch the user's API key.
    const userId = await resolveUserId(supabaseUrl, serviceRoleKey, token, body);
    if (!userId) return jsonResp({ error: "Unauthorized" }, 401, req);

    const apiKey = await loadUserOpenRouterKey(supabase, userId);
    if (!apiKey) {
      return jsonResp({ error: "No OpenRouter key configured for this user" }, 400, req);
    }

    console.log("Web search query:", query.slice(0, 100));

    let result;
    try {
      result = await perplexitySearch(apiKey, query);
    } catch (err) {
      console.error("Perplexity search failed:", err);
      return jsonResp({ error: "Web search failed" }, 502, req);
    }

    await logActivity(supabase, userId, {
      type: "browse",
      title: `Web search: ${query.slice(0, 80)}`,
      summary: result.answer.slice(0, 240),
      content: { citations: result.results.slice(0, 6) },
    });

    return jsonResp({
      answer: result.answer,
      results: result.results,
      engine: "perplexity_sonar",
      synthesis: true,
    }, 200, req);
  } catch (e) {
    console.error("anima-web-search error:", e);
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
