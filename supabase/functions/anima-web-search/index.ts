import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Accept service_role key for internal calls
    let user_id: string;
    if (token === serviceRoleKey) {
      user_id = "system";
    } else {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
      if (authError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      user_id = claimsData.claims.sub;
    }

    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Query is required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get user's API key
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let openrouterKey = "";
    if (user_id !== "system") {
      const { data: decryptedKey } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
      openrouterKey = typeof decryptedKey === "string" ? decryptedKey.trim() : "";
    }
    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: "Web search not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.log("Web search query:", query.slice(0, 100));

    const searchResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic",
      },
      body: JSON.stringify({
        model: "perplexity/sonar",
        messages: [
          {
            role: "system",
            content: "You are a web search assistant. Search for the query and provide a concise answer followed by the key sources. Format your response as JSON with this structure: { \"answer\": \"your synthesized answer\", \"results\": [{ \"title\": \"page title\", \"url\": \"source url\", \"snippet\": \"relevant excerpt\" }] }. Include 4-6 results. Return ONLY valid JSON, no markdown fences.",
          },
          { role: "user", content: query },
        ],
        temperature: 0.1,
      }),
    });

    if (!searchResponse.ok) {
      const text = await searchResponse.text();
      console.error("Sonar search error:", searchResponse.status, text);
      return new Response(JSON.stringify({ error: "Web search failed" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const searchData = await searchResponse.json();
    const rawContent = searchData.choices?.[0]?.message?.content || "";

    // Parse the JSON response from Sonar
    let answer = "";
    let results: Array<{ title: string; url: string; snippet: string }> = [];
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      answer = parsed.answer || rawContent;
      results = (parsed.results || []).map((r: any) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.snippet || r.content || "",
      }));
    } catch {
      // If JSON parsing fails, use the raw response as the answer
      answer = rawContent;
      // Try to extract citations from Sonar's response if available
      const citations = searchData.choices?.[0]?.message?.citations;
      if (Array.isArray(citations)) {
        results = citations.map((url: string) => ({ title: "", url, snippet: "" }));
      }
    }

    // Log activity
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await logActivity(supabase, user_id, {
      type: "browse",
      title: `Web search: ${query}`,
      summary: answer,
    });

    return new Response(JSON.stringify({ answer, results }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-web-search error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
