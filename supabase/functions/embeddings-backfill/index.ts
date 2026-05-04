// embeddings-backfill — one-shot (or polled) backfill of vector embeddings.
//
// Service-role-only entrypoint. Embeds engrams and hypomnema entries that
// don't yet have an embedding, in batches. Idempotent — safe to invoke
// repeatedly until everything has an embedding.
//
// Usage:
//   POST /functions/v1/embeddings-backfill
//   { "user_id": "<uuid>", "limit": 200 }   # backfill one user, up to N rows
//   { "user_id": null, "limit": 500 }        # global pass (uses each user's own key)
//
// Returns counts of engrams and hypomnema entries embedded. Skips users without
// API keys silently.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { buildEmbeddingText, embedBatch } from "../_shared/embeddings.ts";

const DEFAULT_BATCH = 100;

interface BackfillPayload {
  user_id?: string | null;
  limit?: number;
}

interface BackfillCounts {
  engrams_embedded: number;
  engrams_failed: number;
  hypomnema_embedded: number;
  hypomnema_failed: number;
  users_processed: number;
  users_skipped_no_key: number;
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${serviceRole}`) {
      return json({ error: "service_role only" }, 401, corsHeaders);
    }

    const body = (await req.json().catch(() => ({}))) as Partial<BackfillPayload>;
    const targetUserId = typeof body.user_id === "string" ? body.user_id : null;
    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 1000) : DEFAULT_BATCH;

    const supabase = createClient(url, serviceRole);

    const counts: BackfillCounts = {
      engrams_embedded: 0,
      engrams_failed: 0,
      hypomnema_embedded: 0,
      hypomnema_failed: 0,
      users_processed: 0,
      users_skipped_no_key: 0,
    };

    // Determine which users to process.
    let userIds: string[];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data: users } = await supabase
        .from("engrams")
        .select("user_id")
        .is("embedding", null)
        .limit(50);
      userIds = [...new Set((users || []).map((r: { user_id: string }) => r.user_id))];
    }

    for (const userId of userIds) {
      const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
      const apiKey = typeof keyData === "string" ? keyData.trim() : "";
      if (!apiKey) {
        counts.users_skipped_no_key += 1;
        continue;
      }
      counts.users_processed += 1;

      // Engrams
      const { data: engrams } = await supabase
        .from("engrams")
        .select("id, content, engram_type, tags")
        .eq("user_id", userId)
        .is("embedding", null)
        .in("state", ["active", "consolidating"])
        .limit(limit);

      if (engrams && engrams.length > 0) {
        const texts = engrams.map((e: { content: string; engram_type: string; tags: string[] }) =>
          buildEmbeddingText({ content: e.content, engram_type: e.engram_type, tags: e.tags }),
        );
        const results = await embedBatch(apiKey, texts);
        for (let i = 0; i < engrams.length; i++) {
          const r = results[i];
          if (r) {
            const { error } = await supabase
              .from("engrams")
              .update({ embedding: r.vector, embedding_model: r.model })
              .eq("id", engrams[i].id);
            if (error) {
              counts.engrams_failed += 1;
              console.warn(`[embeddings-backfill] engram ${engrams[i].id} update failed:`, error.message);
            } else {
              counts.engrams_embedded += 1;
            }
          } else {
            counts.engrams_failed += 1;
          }
        }
      }

      // Hypomnema entries
      const { data: hyps } = await supabase
        .from("hypomnema_entry")
        .select("id, content, domain")
        .eq("user_id", userId)
        .is("embedding", null)
        .eq("active", true)
        .limit(limit);

      if (hyps && hyps.length > 0) {
        const texts = hyps.map((h: { content: string; domain: string | null }) =>
          (h.domain ? `[${h.domain}] ` : "") + (h.content || ""),
        );
        const results = await embedBatch(apiKey, texts);
        for (let i = 0; i < hyps.length; i++) {
          const r = results[i];
          if (r) {
            const { error } = await supabase
              .from("hypomnema_entry")
              .update({ embedding: r.vector, embedding_model: r.model })
              .eq("id", hyps[i].id);
            if (error) {
              counts.hypomnema_failed += 1;
              console.warn(`[embeddings-backfill] hypomnema ${hyps[i].id} update failed:`, error.message);
            } else {
              counts.hypomnema_embedded += 1;
            }
          } else {
            counts.hypomnema_failed += 1;
          }
        }
      }
    }

    return json({ ok: true, ...counts }, 200, corsHeaders);
  } catch (err) {
    console.error("[embeddings-backfill] error:", err);
    return json({ ok: false, error: (err as Error).message }, 500, getCorsHeaders(req));
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
