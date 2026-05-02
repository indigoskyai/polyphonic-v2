import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { requireServiceRole } from "../_shared/serviceRoleGuard.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const unauthorized = requireServiceRole(req);
  if (unauthorized) return new Response(unauthorized.body, { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find users who have had conversations (threads) in the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: activeConvos } = await supabase
      .from("threads")
      .select("user_id")
      .gte("updated_at", since);

    if (!activeConvos || activeConvos.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No active users" }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Deduplicate user IDs
    const userIds = [...new Set(activeConvos.map((c: any) => c.user_id))];

    // For each user, check they don't already have a recent periodic entry (last 3 hours)
    const recentCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const results: any[] = [];

    for (const userId of userIds) {
      const { data: recentEntry } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("trigger_type", "periodic")
        .gte("created_at", recentCutoff)
        .maybeSingle();

      if (recentEntry) {
        results.push({ user_id: userId, skipped: true, reason: "Recent entry exists" });
        continue;
      }

      // Call journal-write for this user
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/journal-write`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ user_id: userId, trigger_type: "periodic" }),
        });
        const result = await resp.json();
        results.push({ user_id: userId, ...result });
      } catch (e) {
        results.push({ user_id: userId, error: e instanceof Error ? e.message : "Unknown" });
      }
    }

    // ─── Anima: Dream cycle during quiet hours (23:00-08:00 UTC) ───
    const currentHour = new Date().getUTCHours();
    const isQuietHours = currentHour >= 23 || currentHour < 8;

    const dreamResults: any[] = [];
    if (isQuietHours) {
      for (const userId of userIds) {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/anima-dream`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ user_id: userId }),
          });
          const result = await resp.json();
          dreamResults.push({ user_id: userId, ...result });
        } catch (e) {
          dreamResults.push({ user_id: userId, error: e instanceof Error ? e.message : "Unknown" });
        }
      }
    }

    // ─── Anima: Update emotional state for all active users ───
    const emotionResults: any[] = [];
    for (const userId of userIds) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/anima-emotional-state`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ user_id: userId }),
        });
        const result = await resp.json();
        emotionResults.push({ user_id: userId, ...result });
      } catch (e) {
        emotionResults.push({ user_id: userId, error: e instanceof Error ? e.message : "Unknown" });
      }
    }

    // ─── Anima: Check thought initiation for all active users ───
    const initiationResults: any[] = [];
    for (const userId of userIds) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/anima-initiate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ user_id: userId, action: "check" }),
        });
        const result = await resp.json();
        initiationResults.push({ user_id: userId, ...result });
      } catch (e) {
        initiationResults.push({ user_id: userId, error: e instanceof Error ? e.message : "Unknown" });
      }
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
      dreams: isQuietHours ? dreamResults : "skipped (not quiet hours)",
      emotional_updates: emotionResults,
      initiations: initiationResults,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("journal-cron error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
