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

    const { url, focus } = await req.json();

    if (!url || typeof url !== "string" || url.trim().length === 0) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.log("Web read URL:", url.slice(0, 200));

    // Fetch the URL
    let html: string;
    try {
      const fetchResponse = await fetch(url, {
        headers: {
          "User-Agent": "Polyphonic/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      if (!fetchResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch URL: ${fetchResponse.status}` }),
          { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      html = await fetchResponse.text();
    } catch (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Failed to fetch the URL" }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract text from HTML
    let extractedText = html;
    // Remove script and style blocks
    extractedText = extractedText.replace(/<script[\s\S]*?<\/script>/gi, "");
    extractedText = extractedText.replace(/<style[\s\S]*?<\/style>/gi, "");
    // Remove all HTML tags
    extractedText = extractedText.replace(/<[^>]+>/g, " ");
    // Decode HTML entities
    extractedText = extractedText
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    // Collapse whitespace
    extractedText = extractedText.replace(/\s+/g, " ").trim();
    // Truncate to 8000 chars
    extractedText = extractedText.slice(0, 8000);

    // If focus provided, summarize via OpenRouter
    let summary: string | undefined;
    if (focus && typeof focus === "string" && focus.trim().length > 0) {
      const apiKey = userApiKey;
      if (apiKey) {
        try {
          const summaryResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://polyphonic.chat",
              "X-Title": "Polyphonic",
            },
            body: JSON.stringify({
              model: "anthropic/claude-sonnet-4.6",
              messages: [
                {
                  role: "system",
                  content: `Summarize the following web page content. Focus on: ${focus}. Be concise and informative. Max 500 words.`,
                },
                {
                  role: "user",
                  content: extractedText,
                },
              ],
            }),
          });

          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            summary = summaryData.choices?.[0]?.message?.content || undefined;
          } else {
            console.error("Summary generation failed:", summaryResponse.status);
          }
        } catch (summaryErr) {
          console.error("Summary generation error:", summaryErr);
        }
      }
    }

    // Log activity
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await logActivity(supabase, user_id, {
      type: "browse",
      title: `Read: ${title || url}`,
    });

    const result: Record<string, unknown> = { title, url, content: extractedText };
    if (summary) {
      result.summary = summary;
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-web-read error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
