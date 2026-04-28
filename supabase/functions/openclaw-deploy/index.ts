import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Push an agent spec change to the user's local OpenClaw runtime(s).
// For v1 this just upserts openclaw_agents; the bridge polls / subscribes for changes.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    const body = await req.json().catch(() => null);
    if (!body || typeof body.agent_config_id !== "string" || typeof body.spec !== "object") {
      return new Response(JSON.stringify({ error: "agent_config_id and spec required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify agent_config belongs to user
    const { data: cfg, error: cfgErr } = await admin
      .from("agent_configs")
      .select("id, user_id")
      .eq("user_id", userId)
      .eq("id", body.agent_config_id)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert openclaw_agents
    const { data: existing } = await admin
      .from("openclaw_agents")
      .select("id, spec_version")
      .eq("user_id", userId)
      .eq("agent_config_id", body.agent_config_id)
      .maybeSingle();

    let agentRowId: string;
    let newVersion = 1;
    if (existing) {
      newVersion = (existing.spec_version || 0) + 1;
      const { error } = await admin
        .from("openclaw_agents")
        .update({
          spec: body.spec,
          spec_version: newVersion,
          sync_history: body.sync_history !== false,
        })
        .eq("id", existing.id);
      if (error) throw error;
      agentRowId = existing.id;
    } else {
      const { data: ins, error } = await admin
        .from("openclaw_agents")
        .insert({
          user_id: userId,
          agent_config_id: body.agent_config_id,
          spec: body.spec,
          spec_version: 1,
          sync_history: body.sync_history !== false,
        })
        .select("id")
        .single();
      if (error) throw error;
      agentRowId = ins.id;
      newVersion = 1;
    }

    // Bind agent_configs row to this openclaw_agent
    await admin
      .from("agent_configs")
      .update({ openclaw_agent_id: agentRowId })
      .eq("user_id", userId)
      .eq("id", body.agent_config_id);

    return new Response(
      JSON.stringify({ openclaw_agent_id: agentRowId, spec_version: newVersion }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("openclaw-deploy error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
