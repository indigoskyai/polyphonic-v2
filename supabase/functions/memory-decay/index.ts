import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/serviceRoleGuard.ts";
import { trackCronJob } from "../_shared/cronHealth.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const unauthorized = requireServiceRole(req, corsHeaders);
  if (unauthorized) return unauthorized;

  try {
    const result = await trackCronJob("memory-decay", async () => {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data, error } = await supabase.rpc("update_memory_decay");
      if (error) throw new Error(`Decay RPC error: ${error.message}`);

      // Reduce sharpness proportionally to decay_factor
      const { data: decayedMemories } = await supabase
        .from("memories")
        .select("id, decay_factor, sharpness")
        .eq("is_deleted", false)
        .lt("decay_factor", 0.9);

      let sharpnessUpdated = 0;
      if (decayedMemories) {
        for (const m of decayedMemories) {
          const currentSharpness = m.sharpness ?? 1.0;
          const targetSharpness = Math.min(currentSharpness, m.decay_factor);
          if (targetSharpness < currentSharpness - 0.01) {
            await supabase
              .from("memories")
              .update({ sharpness: Math.round(targetSharpness * 1000) / 1000 })
              .eq("id", m.id);
            sharpnessUpdated++;
          }
        }
      }

      console.log(`Memory decay complete. Rows: ${data}, sharpness updated: ${sharpnessUpdated}`);
      return { success: true, rows_affected: data, sharpness_updated: sharpnessUpdated };
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("memory-decay error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", code: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
