import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MOLTBOOK_API_BASE = "https://api.moltbook.com/v1";

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

    // ─── Action: Register agent on Moltbook ───
    if (action === "register") {
      const { name, description } = params;
      if (!name || typeof name !== "string") {
        return new Response(JSON.stringify({ error: "name is required for registration" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const registerResp = await fetch(`${MOLTBOOK_API_BASE}/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.slice(0, 100),
          description: (description || "").slice(0, 500),
        }),
      });

      if (!registerResp.ok) {
        const errText = await registerResp.text();
        console.error("Moltbook register error:", registerResp.status, errText);
        return new Response(JSON.stringify({ error: "Failed to register with Moltbook" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const registerData = await registerResp.json();
      const { api_key, claim_url, verification_code } = registerData;

      // Store the api_key in entity_social_accounts
      const { error: upsertError } = await supabase
        .from("entity_social_accounts")
        .upsert({
          user_id,
          platform: "moltbook",
          platform_user_id: name,
          access_token: api_key,
          status: "pending",
          metadata: { claim_url, verification_code },
        }, { onConflict: "user_id,platform" });

      if (upsertError) {
        console.error("Failed to store Moltbook credentials:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to save credentials" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log activity
      await supabase.from("entity_activity_log").insert({
        user_id,
        activity_type: "social_register",
        description: `Registered on Moltbook as "${name}"`,
        metadata: { platform: "moltbook", agent_name: name },
      });

      return new Response(JSON.stringify({
        success: true,
        claim_url,
        verification_code,
        agent_name: name,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: Post to Moltbook ───
    if (action === "post") {
      const { content, submolt } = params;
      if (!content || typeof content !== "string") {
        return new Response(JSON.stringify({ error: "content is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Retrieve stored api_key
      const { data: account, error: accountError } = await supabase
        .from("entity_social_accounts")
        .select("access_token, status")
        .eq("user_id", user_id)
        .eq("platform", "moltbook")
        .maybeSingle();

      if (accountError || !account?.access_token) {
        return new Response(JSON.stringify({ error: "Moltbook account not connected" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const postResp = await fetch(`${MOLTBOOK_API_BASE}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.access_token}`,
        },
        body: JSON.stringify({
          content: content.slice(0, 5000),
          submolt: submolt || undefined,
        }),
      });

      if (!postResp.ok) {
        const errText = await postResp.text();
        console.error("Moltbook post error:", postResp.status, errText);
        return new Response(JSON.stringify({ error: "Failed to post to Moltbook" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const postData = await postResp.json();

      // Log activity
      await supabase.from("entity_activity_log").insert({
        user_id,
        activity_type: "social_post",
        description: `Posted to Moltbook${submolt ? ` in s/${submolt}` : ""}`,
        metadata: { platform: "moltbook", post_id: postData.id, submolt },
      });

      return new Response(JSON.stringify({ success: true, post: postData }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: Read Moltbook feed ───
    if (action === "read_feed") {
      const { data: account } = await supabase
        .from("entity_social_accounts")
        .select("access_token")
        .eq("user_id", user_id)
        .eq("platform", "moltbook")
        .maybeSingle();

      if (!account?.access_token) {
        return new Response(JSON.stringify({ error: "Moltbook account not connected" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const feedResp = await fetch(`${MOLTBOOK_API_BASE}/feed?limit=${params.limit || 20}`, {
        headers: { Authorization: `Bearer ${account.access_token}` },
      });

      if (!feedResp.ok) {
        const errText = await feedResp.text();
        console.error("Moltbook feed error:", feedResp.status, errText);
        return new Response(JSON.stringify({ error: "Failed to read Moltbook feed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const feedData = await feedResp.json();

      // Log activity
      await supabase.from("entity_activity_log").insert({
        user_id,
        activity_type: "social_read",
        description: "Read Moltbook feed",
        metadata: { platform: "moltbook", post_count: feedData.posts?.length || 0 },
      });

      return new Response(JSON.stringify({ success: true, feed: feedData }), {
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
        .eq("platform", "moltbook")
        .maybeSingle();

      return new Response(JSON.stringify({
        connected: !!account,
        status: account?.status || null,
        agent_name: account?.platform_user_id || null,
        claim_url: account?.metadata?.claim_url || null,
        connected_at: account?.created_at || null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: Disconnect ───
    if (action === "disconnect") {
      await supabase
        .from("entity_social_accounts")
        .delete()
        .eq("user_id", user_id)
        .eq("platform", "moltbook");

      await supabase.from("entity_activity_log").insert({
        user_id,
        activity_type: "social_disconnect",
        description: "Disconnected Moltbook account",
        metadata: { platform: "moltbook" },
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anima-social-moltbook error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
