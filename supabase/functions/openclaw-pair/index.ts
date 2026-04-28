import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let bodyJson: any = null;
    if (req.method === "POST") {
      bodyJson = await req.clone().json().catch(() => null);
    }
    const action = url.searchParams.get("action") || bodyJson?.action || "issue";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (action === "issue") {
      // Authenticated user requesting a new pairing code
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

      const admin = createClient(supabaseUrl, serviceKey);
      const code = generateCode();
      const expires = new Date(Date.now() + 15 * 60_000).toISOString();
      const { error } = await admin.from("openclaw_pairing_codes").insert({
        code,
        user_id: userId,
        expires_at: expires,
      });
      if (error) throw error;

      return new Response(
        JSON.stringify({ code, expires_at: expires, ttl_seconds: 15 * 60 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "claim") {
      // Anonymous bridge CLI claiming a code
      const body = await req.json().catch(() => null);
      if (!body || typeof body.code !== "string" || typeof body.device_name !== "string") {
        return new Response(JSON.stringify({ error: "code and device_name required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(supabaseUrl, serviceKey);

      const { data: row, error: lookupErr } = await admin
        .from("openclaw_pairing_codes")
        .select("code, user_id, expires_at, consumed_device_id")
        .eq("code", body.code)
        .maybeSingle();

      if (lookupErr) throw lookupErr;
      if (!row || row.consumed_device_id) {
        return new Response(JSON.stringify({ error: "Invalid or used code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return new Response(JSON.stringify({ error: "Code expired" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: device, error: devErr } = await admin
        .from("openclaw_devices")
        .insert({
          user_id: row.user_id,
          name: body.device_name.slice(0, 80),
          platform: typeof body.platform === "string" ? body.platform.slice(0, 40) : null,
          bridge_version: typeof body.bridge_version === "string" ? body.bridge_version.slice(0, 40) : null,
          status: "online",
          last_seen_at: new Date().toISOString(),
        })
        .select("id, user_id")
        .single();
      if (devErr) throw devErr;

      await admin
        .from("openclaw_pairing_codes")
        .update({ consumed_device_id: device.id, consumed_at: new Date().toISOString() })
        .eq("code", row.code);

      // Device token = signed payload the bridge presents to openclaw-bridge.
      // For v1 we use a simple opaque token = device.id; future: rotate JWT.
      return new Response(
        JSON.stringify({
          device_id: device.id,
          user_id: device.user_id,
          device_token: device.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("openclaw-pair error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
