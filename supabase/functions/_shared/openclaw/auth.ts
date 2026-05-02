// Shared helpers for OpenClaw edge functions.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function getUserClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

export async function authenticateUser(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const userClient = getUserClient(authHeader);
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error } = await userClient.auth.getClaims(token);
  if (error || !claims?.claims?.sub) return null;
  return { userId: claims.claims.sub as string };
}

/**
 * Verifies a bridge's device token against the stored hash.
 * Returns the device row on success.
 */
export async function authenticateDeviceToken(
  deviceId: string,
  deviceToken: string,
): Promise<{ device_id: string; user_id: string } | null> {
  if (!deviceId || !deviceToken) return null;
  const admin = getServiceClient();
  const { data, error } = await admin.rpc("openclaw_verify_device_token", {
    p_device_id: deviceId,
    p_token: deviceToken,
  });
  if (error || data !== true) return null;
  const { data: device } = await admin
    .from("openclaw_devices")
    .select("id, user_id, status")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device || device.status === "revoked") return null;
  return { device_id: device.id, user_id: device.user_id };
}

// CORS: openclaw endpoints are device-token authenticated and called by
// external (non-browser) clients. Wildcard origin is intentional.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id, x-device-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
