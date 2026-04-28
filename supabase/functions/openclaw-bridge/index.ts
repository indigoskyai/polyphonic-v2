import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-token, upgrade",
};

// In-memory device socket registry. Edge function instances are short-lived,
// so this only multiplexes within a single warm instance. For multi-instance
// scale we'd promote to a Realtime channel; v1 is single-instance acceptable.
const deviceSockets = new Map<string, WebSocket>();
const pendingResponses = new Map<string, (msg: unknown) => void>();

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function authenticateDevice(token: string): Promise<{ device_id: string; user_id: string } | null> {
  const admin = getServiceClient();
  const { data, error } = await admin
    .from("openclaw_devices")
    .select("id, user_id, status")
    .eq("id", token)
    .maybeSingle();
  if (error || !data || data.status === "revoked") return null;
  return { device_id: data.id, user_id: data.user_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // ─────────────────────────────────────────────────────────────────
  // WebSocket upgrade: bridge CLI connecting from user's machine
  // ─────────────────────────────────────────────────────────────────
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const deviceToken = url.searchParams.get("device_token") || req.headers.get("x-device-token");
    if (!deviceToken) {
      return new Response("device_token required", { status: 401 });
    }
    const auth = await authenticateDevice(deviceToken);
    if (!auth) return new Response("Invalid device token", { status: 401 });

    const { socket, response } = Deno.upgradeWebSocket(req);
    const admin = getServiceClient();

    socket.onopen = async () => {
      deviceSockets.set(auth.device_id, socket);
      await admin
        .from("openclaw_devices")
        .update({ status: "online", last_seen_at: new Date().toISOString() })
        .eq("id", auth.device_id);
      await admin.from("openclaw_relay_sessions").insert({
        user_id: auth.user_id,
        device_id: auth.device_id,
      });
    };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        // Bridge → web: response to a pending request, or push event
        if (msg?.request_id && pendingResponses.has(msg.request_id)) {
          pendingResponses.get(msg.request_id)!(msg);
          pendingResponses.delete(msg.request_id);
        }
        // Other message types (telemetry, agent-spec acks) handled here later.
      } catch {
        // ignore malformed
      }
    };

    socket.onclose = async () => {
      deviceSockets.delete(auth.device_id);
      await admin
        .from("openclaw_devices")
        .update({ status: "offline", last_seen_at: new Date().toISOString() })
        .eq("id", auth.device_id);
    };

    socket.onerror = (e) => console.error("bridge ws error", e);
    return response;
  }

  // ─────────────────────────────────────────────────────────────────
  // HTTP: web app → bridge proxy (chat completions, ping, deploy push)
  // ─────────────────────────────────────────────────────────────────
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
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
    if (!body?.action) {
      return new Response(JSON.stringify({ error: "action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "list_devices") {
      const admin = getServiceClient();
      const { data, error } = await admin
        .from("openclaw_devices")
        .select("id, name, platform, status, last_seen_at, bridge_version, is_default")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const live = data?.map((d) => ({
        ...d,
        connected: deviceSockets.has(d.id),
      }));
      return new Response(JSON.stringify({ devices: live }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "completion") {
      // body: { device_id, agent_config_id, messages, thread_id }
      if (!body.device_id || !Array.isArray(body.messages)) {
        return new Response(JSON.stringify({ error: "device_id and messages required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify device belongs to user
      const admin = getServiceClient();
      const { data: device } = await admin
        .from("openclaw_devices")
        .select("id, user_id")
        .eq("id", body.device_id)
        .maybeSingle();
      if (!device || device.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Device not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sock = deviceSockets.get(body.device_id);
      if (!sock || sock.readyState !== WebSocket.OPEN) {
        return new Response(
          JSON.stringify({ error: "Device offline. Start Polyphonic Bridge to chat." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const requestId = crypto.randomUUID();
      const reply = await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingResponses.delete(requestId);
          reject(new Error("Local runtime timed out"));
        }, 120_000);
        pendingResponses.set(requestId, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        sock.send(
          JSON.stringify({
            type: "completion",
            request_id: requestId,
            agent_config_id: body.agent_config_id,
            thread_id: body.thread_id,
            messages: body.messages,
          }),
        );
      });

      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("openclaw-bridge error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
