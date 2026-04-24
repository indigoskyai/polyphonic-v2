import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

type Action = "pin" | "commit" | "edit" | "reject";

interface Body {
  id?: string;
  action?: Action;
  patch?: { content?: string; memory_type?: string };
}

const VALID_ACTIONS: Action[] = ["pin", "commit", "edit", "reject"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authn
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: authErr } = await supabaseAuth.auth.getClaims(token);
    if (authErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }
    const userId = claimsData.claims.sub as string;

    // Parse + validate body
    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.id || !UUID_RE.test(body.id)) {
      return json({ error: "Valid id required" }, 400, corsHeaders);
    }
    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return json({ error: `action must be one of ${VALID_ACTIONS.join(", ")}` }, 400, corsHeaders);
    }

    // Service-role client for trusted writes after we've already verified ownership
    const admin = createClient(supabaseUrl, serviceKey);

    // Load candidate (RLS enforces ownership via the user-scoped client)
    const { data: candidate, error: loadErr } = await supabaseAuth
      .from("memory_candidates")
      .select("*")
      .eq("id", body.id)
      .maybeSingle();
    if (loadErr) return json({ error: loadErr.message }, 500, corsHeaders);
    if (!candidate) return json({ error: "Not found" }, 404, corsHeaders);
    if (candidate.user_id !== userId) return json({ error: "Forbidden" }, 403, corsHeaders);

    const action = body.action;
    const nowIso = new Date().toISOString();

    if (action === "edit") {
      const updates: Record<string, unknown> = {};
      if (typeof body.patch?.content === "string" && body.patch.content.trim().length > 0) {
        updates.content = body.patch.content.trim();
      }
      if (typeof body.patch?.memory_type === "string" && body.patch.memory_type.trim().length > 0) {
        updates.memory_type = body.patch.memory_type.trim();
      }
      if (Object.keys(updates).length === 0) {
        return json({ error: "edit requires patch.content or patch.memory_type" }, 400, corsHeaders);
      }
      const { data: updated, error: updErr } = await admin
        .from("memory_candidates")
        .update(updates)
        .eq("id", candidate.id)
        .select("*")
        .single();
      if (updErr) return json({ error: updErr.message }, 500, corsHeaders);
      return json({ candidate: updated }, 200, corsHeaders);
    }

    if (action === "reject") {
      const { data: updated, error: updErr } = await admin
        .from("memory_candidates")
        .update({ status: "rejected", reviewed_at: nowIso })
        .eq("id", candidate.id)
        .select("*")
        .single();
      if (updErr) return json({ error: updErr.message }, 500, corsHeaders);
      return json({ candidate: updated }, 200, corsHeaders);
    }

    // commit / pin paths — both write to memories
    const memoryRow: Record<string, unknown> = {
      user_id: userId,
      content: candidate.content,
      memory_type: candidate.memory_type,
      confidence: candidate.confidence,
      provenance: {
        ...(candidate.source ?? {}),
        candidate_id: candidate.id,
        committed_via: action,
      },
      pinned: action === "pin",
    };

    const { error: memErr } = await admin.from("memories").insert(memoryRow);
    if (memErr) {
      console.error("[memory-candidate-action] memories insert failed:", memErr);
      return json({ error: `memories insert: ${memErr.message}` }, 500, corsHeaders);
    }

    const newStatus = action === "pin" ? "pinned" : "committed";
    const { data: updated, error: updErr } = await admin
      .from("memory_candidates")
      .update({ status: newStatus, reviewed_at: nowIso })
      .eq("id", candidate.id)
      .select("*")
      .single();
    if (updErr) return json({ error: updErr.message }, 500, corsHeaders);

    return json({ candidate: updated }, 200, corsHeaders);
  } catch (err) {
    console.error("memory-candidate-action error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500, getCorsHeaders(req));
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
