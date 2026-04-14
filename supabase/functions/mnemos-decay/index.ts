import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { MnemosEngine } from "../_shared/mnemos/engine.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user_id from request body or run for all users (cron mode)
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;

    if (userId) {
      const engine = new MnemosEngine(supabase, userId);
      const result = await engine.decay({ min_hours_since_access: 1, archive_below_threshold: true });
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode: decay for all users with active engrams
    const { data: users } = await supabase
      .from("engrams")
      .select("user_id")
      .in("state", ["active", "consolidating", "dormant"])
      .limit(100);

    const uniqueUsers = [...new Set((users ?? []).map((u: { user_id: string }) => u.user_id))];
    const results: Record<string, unknown> = {};

    for (const uid of uniqueUsers) {
      try {
        const engine = new MnemosEngine(supabase, uid);
        results[uid] = await engine.decay({ min_hours_since_access: 1, archive_below_threshold: true });
      } catch (e) {
        results[uid] = { error: (e as Error).message };
      }
    }

    return new Response(JSON.stringify({ success: true, users_processed: uniqueUsers.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("mnemos-decay error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
