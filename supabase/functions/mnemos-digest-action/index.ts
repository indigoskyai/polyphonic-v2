/**
 * mnemos-digest-action — apply the user's review decision on a single engram.
 *
 * POST { engram_id, action: 'confirm' | 'reject' | 'edit', patch?: { content?: string, tags?: string[] } }
 *
 * confirm → state='active', stability += 0.15 (cap 1), reviewed_at=now()
 * reject  → state='archived', accessibility=0, reviewed_at=now()
 * edit    → updates content/tags, surprise re-anchored, marked reviewed (decision='edited')
 *
 * After every action the parent digest's reviewed_count is incremented; if all
 * engrams in the digest are reviewed the digest is finalized.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { authenticateUser } from "../_shared/openclaw/auth.ts";

type Action = "confirm" | "reject" | "edit";
interface Body {
  engram_id?: string;
  action?: Action;
  patch?: { content?: string; tags?: string[]; review_note?: string };
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  const auth = await authenticateUser(req);
  if (!auth) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  let body: Body = {};
  try { body = await req.json(); } catch { /* */ }
  const { engram_id, action, patch } = body;
  if (!engram_id || !action || !["confirm", "reject", "edit"].includes(action)) {
    return json({ error: "invalid body" }, 400, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify engram belongs to caller and load current values
  const { data: engram, error: loadErr } = await supabase
    .from("engrams")
    .select("id, user_id, agent_id, content, stability, digest_id, reviewed_at")
    .eq("id", engram_id)
    .maybeSingle();
  if (loadErr || !engram) return json({ error: "engram not found" }, 404, cors);
  if (engram.user_id !== auth.userId) return json({ error: "forbidden" }, 403, cors);

  const wasReviewed = !!engram.reviewed_at;
  const now = new Date().toISOString();
  let update: Record<string, unknown> = {
    reviewed_at: now,
    reviewed_by: "user",
    review_note: patch?.review_note ?? null,
  };

  if (action === "confirm") {
    update = {
      ...update,
      state: "active",
      stability: Math.min(1, (engram.stability ?? 0) + 0.15),
      review_decision: "confirmed",
    };
  } else if (action === "reject") {
    update = {
      ...update,
      state: "archived",
      accessibility: 0,
      review_decision: "rejected",
    };
  } else {
    // edit
    const content = patch?.content?.trim();
    if (!content) return json({ error: "edit requires patch.content" }, 400, cors);
    update = {
      ...update,
      content,
      tags: patch?.tags ?? undefined,
      review_decision: "edited",
      state: "active",
    };
  }

  const { data: updated, error: updErr } = await supabase
    .from("engrams")
    .update(update)
    .eq("id", engram_id)
    .select("*")
    .single();
  if (updErr) return json({ error: updErr.message }, 500, cors);

  // Roll up digest counters (only if first review of this engram)
  if (engram.digest_id && !wasReviewed) {
    const { data: dig } = await supabase
      .from("mnemos_digests")
      .select("id, engram_count, reviewed_count")
      .eq("id", engram.digest_id)
      .maybeSingle();
    if (dig) {
      const newReviewed = (dig.reviewed_count ?? 0) + 1;
      const finalize = newReviewed >= (dig.engram_count ?? 0);
      await supabase
        .from("mnemos_digests")
        .update({
          reviewed_count: newReviewed,
          status: finalize ? "finalized" : "open",
          finalized_at: finalize ? now : null,
        })
        .eq("id", dig.id);
    }
  }

  // Activity log breadcrumb
  await supabase.from("entity_activity_log").insert({
    user_id: auth.userId,
    agent_id: engram.agent_id || "luca",
    activity_type: "mnemos_digest_review",
    title: `engram ${action}`,
    summary: (updated.content ?? "").slice(0, 160),
    content: { engram_id, action, digest_id: engram.digest_id },
    source: "user",
  });

  await supabase.from("continuity_events").insert({
    user_id: auth.userId,
    agent_id: engram.agent_id || "luca",
    event_type: action === "reject" ? "digest_rejected" : action === "edit" ? "digest_distilled" : "digest_accepted",
    subject_type: "engram",
    subject_id: engram_id,
    metadata: { action, digest_id: engram.digest_id },
  });

  return json({ ok: true, engram: updated }, 200, cors);
});

function json(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
