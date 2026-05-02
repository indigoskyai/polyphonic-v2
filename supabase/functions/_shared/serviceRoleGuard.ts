// Reusable guard: only allow Supabase service-role bearer (cron / pg_net / server) to call.
export function requireServiceRole(req: Request): Response | null {
  const auth = req.headers.get("Authorization") || "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`;
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized — service role only" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
