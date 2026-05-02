// Reusable guard: only allow Supabase service-role bearer (cron / pg_net / server) to call.
// Returns a 401 Response (with provided cors headers) if not authorized, otherwise null.
export function requireServiceRole(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Response | null {
  const auth = req.headers.get("Authorization") || "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`;
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized — service role only" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}
