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

    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;

    // Get OpenRouter API key for dreaming
    let apiKey: string | null = null;
    if (userId) {
      const { data: userKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
      if (userKeyData) apiKey = userKeyData;
    }
    if (!apiKey) apiKey = Deno.env.get("OPENROUTER_API_KEY") || null;

    if (userId) {
      const engine = new MnemosEngine(supabase, userId);
      const result = await engine.consolidate({
        lookback_hours: body.lookback_hours || 24,
        openrouter_api_key: apiKey || undefined,
      });
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode: consolidate for all users with recent activity
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: users } = await supabase
      .from("engrams")
      .select("user_id")
      .gte("last_accessed_at", cutoff)
      .limit(100);

    const uniqueUsers = [...new Set((users ?? []).map((u: { user_id: string }) => u.user_id))];
    const results: Record<string, unknown> = {};

    for (const uid of uniqueUsers) {
      try {
        // Get user's API key for dreaming
        let userApiKey = apiKey;
        const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: uid });
        if (keyData) userApiKey = keyData;

        const engine = new MnemosEngine(supabase, uid);
        results[uid] = await engine.consolidate({
          lookback_hours: 24,
          openrouter_api_key: userApiKey || undefined,
        });
      } catch (e) {
        results[uid] = { error: (e as Error).message };
      }
    }

    return new Response(JSON.stringify({ success: true, users_processed: uniqueUsers.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("mnemos-consolidate error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
