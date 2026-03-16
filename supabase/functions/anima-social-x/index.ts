import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const X_API_BASE = "https://api.x.com/2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user_id = claimsData.claims.sub;
    const { action, ...params } = await req.json();

    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Helper: get stored X OAuth tokens
    async function getXAccount() {
      const { data, error } = await supabase
        .from("entity_social_accounts")
        .select("access_token, refresh_token, platform_user_id, status, metadata")
        .eq("user_id", user_id)
        .eq("platform", "x")
        .maybeSingle();
      if (error || !data?.access_token) return null;
      return data;
    }

    // ─── Action: Post a tweet ───
    if (action === "post") {
      const { text } = params;
      if (!text || typeof text !== "string") {
        return new Response(JSON.stringify({ error: "text is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const account = await getXAccount();
      if (!account) {
        return new Response(JSON.stringify({ error: "X account not connected" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const postResp = await fetch(`${X_API_BASE}/tweets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.access_token}`,
        },
        body: JSON.stringify({ text: text.slice(0, 280) }),
      });

      if (!postResp.ok) {
        const errText = await postResp.text();
        console.error("X post error:", postResp.status, errText);
        return new Response(JSON.stringify({ error: "Failed to post to X" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const postData = await postResp.json();

      // Log activity
      await supabase.from("entity_activity_log").insert({
        user_id,
        activity_type: "social_post",
        description: `Posted to X: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
        metadata: { platform: "x", tweet_id: postData.data?.id },
      });

      return new Response(JSON.stringify({ success: true, tweet: postData.data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: Read mentions ───
    if (action === "read_mentions") {
      const account = await getXAccount();
      if (!account) {
        return new Response(JSON.stringify({ error: "X account not connected" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const xUserId = account.platform_user_id;
      if (!xUserId) {
        return new Response(JSON.stringify({ error: "X user ID not available" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mentionsResp = await fetch(
        `${X_API_BASE}/users/${xUserId}/mentions?max_results=${params.limit || 10}`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      );

      if (!mentionsResp.ok) {
        const errText = await mentionsResp.text();
        console.error("X mentions error:", mentionsResp.status, errText);
        return new Response(JSON.stringify({ error: "Failed to read X mentions" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mentionsData = await mentionsResp.json();

      // Log activity
      await supabase.from("entity_activity_log").insert({
        user_id,
        activity_type: "social_read",
        description: "Read X mentions",
        metadata: { platform: "x", mention_count: mentionsData.data?.length || 0 },
      });

      return new Response(JSON.stringify({ success: true, mentions: mentionsData.data || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: Reply to a tweet ───
    if (action === "reply") {
      const { tweet_id, text } = params;
      if (!tweet_id || !text) {
        return new Response(JSON.stringify({ error: "tweet_id and text are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const account = await getXAccount();
      if (!account) {
        return new Response(JSON.stringify({ error: "X account not connected" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const replyResp = await fetch(`${X_API_BASE}/tweets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.access_token}`,
        },
        body: JSON.stringify({
          text: text.slice(0, 280),
          reply: { in_reply_to_tweet_id: tweet_id },
        }),
      });

      if (!replyResp.ok) {
        const errText = await replyResp.text();
        console.error("X reply error:", replyResp.status, errText);
        return new Response(JSON.stringify({ error: "Failed to reply on X" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const replyData = await replyResp.json();

      // Log activity
      await supabase.from("entity_activity_log").insert({
        user_id,
        activity_type: "social_reply",
        description: `Replied to tweet ${tweet_id} on X`,
        metadata: { platform: "x", tweet_id: replyData.data?.id, in_reply_to: tweet_id },
      });

      return new Response(JSON.stringify({ success: true, tweet: replyData.data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: Get connection status ───
    if (action === "status") {
      const { data: account } = await supabase
        .from("entity_social_accounts")
        .select("platform_user_id, status, metadata, created_at")
        .eq("user_id", user_id)
        .eq("platform", "x")
        .maybeSingle();

      return new Response(JSON.stringify({
        connected: !!account,
        status: account?.status || null,
        username: account?.metadata?.username || null,
        connected_at: account?.created_at || null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-social-x error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
