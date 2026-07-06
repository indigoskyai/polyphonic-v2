/**
 * mnemos-digest-suggest
 *
 * Luca pre-review preview for digest entries. Writes suggestion metadata only;
 * final review state remains human/auto-review controlled by digest-action and
 * SQL auto-review paths.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { authenticateUser } from "../_shared/openclaw/auth.ts";
import { getMemorySettings } from "../_shared/mnemos/settings.ts";
import {
  normalizeDigestSuggestions,
  type DigestSuggestionAction,
} from "../_shared/mnemos/digest-suggestions.ts";
import { resolveRoleModel } from "../_shared/model-backend.ts";
import { withModelRetry } from "../_shared/modelRetry.ts";

interface Body {
  user_id?: string;
  agent_id?: string;
  digest_id?: string;
}

interface DigestEngram {
  id: string;
  content: string;
  tags: string[] | null;
  surprise_score: number | null;
  emotional_arousal: number | null;
}

const ACTIONS = new Set<DigestSuggestionAction>(["keep", "release", "distill"]);

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole);
  const body = (await req.json().catch(() => ({}))) as Body;
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${serviceRole}`;

  let userId = body.user_id ?? null;
  if (!isServiceRole) {
    const auth = await authenticateUser(req);
    if (!auth) return json({ error: "unauthorized" }, 401, cors);
    if (userId && userId !== auth.userId) return json({ error: "forbidden" }, 403, cors);
    userId = auth.userId;
  }
  if (!userId) return json({ error: "user_id required" }, 400, cors);

  const agentId = body.agent_id || "luca";
  try {
    const settings = await getMemorySettings(supabase, userId);
    if (!settings.mnemos_enabled) return json({ ok: true, skipped: true, reason: "mnemos_disabled" }, 200, cors);
    if (!settings.full_cognition_enabled) return json({ ok: true, skipped: true, reason: "full_cognition_disabled" }, 200, cors);

    const { data: keyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
    const apiKey = (keyData as string | null) ?? null;
    if (!apiKey) return json({ ok: true, skipped: true, reason: "no_api_key" }, 200, cors);

    const digestId = body.digest_id ?? await loadOpenDigestId(supabase, userId, agentId);
    if (!digestId) return json({ ok: true, skipped: true, reason: "no_open_digest" }, 200, cors);

    const { data: rows, error } = await supabase
      .from("engrams")
      .select("id, content, tags, surprise_score, emotional_arousal")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .eq("digest_id", digestId)
      .is("reviewed_at", null)
      .limit(30);
    if (error) throw error;
    const engrams = (rows ?? []) as DigestEngram[];
    if (engrams.length === 0) return json({ ok: true, digest_id: digestId, suggested: 0 }, 200, cors);

    const model = await resolveRoleModel(supabase, userId, agentId, "mechanical");
    const suggestions = await suggestDigestActions(apiKey, model, engrams);
    let updated = 0;
    for (const suggestion of suggestions) {
      const engram = engrams.find((row) => row.id === suggestion.id);
      const action = suggestion.action as DigestSuggestionAction;
      if (!engram || !ACTIONS.has(action) || suggestion.confidence < 0 || suggestion.confidence > 1) continue;
      const { error: updateErr } = await supabase
        .from("engrams")
        .update({
          digest_suggestion_action: action,
          digest_suggestion_reason: suggestion.reason.slice(0, 500),
          digest_suggestion_confidence: suggestion.confidence,
          digest_suggested_by: "luca",
          digest_suggestion_model: model,
          digest_suggestion_generated_at: new Date().toISOString(),
        })
        .eq("id", engram.id)
        .eq("user_id", userId)
        .eq("agent_id", agentId)
        .is("reviewed_at", null);
      if (!updateErr) updated++;
    }

    return json({ ok: true, digest_id: digestId, suggested: updated }, 200, cors);
  } catch (err) {
    console.error("mnemos-digest-suggest error:", err);
    return json({ error: (err as Error).message }, 500, cors);
  }
});

async function loadOpenDigestId(supabase: SupabaseClient, userId: string, agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("mnemos_digests")
    .select("id")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("status", "open")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function suggestDigestActions(apiKey: string, model: string, engrams: DigestEngram[]) {
  const response = await withModelRetry(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are Luca pre-reviewing Mnemos digest entries.",
            "Suggest one action per entry: keep, release, or distill.",
            "Keep means useful as-is. Release means low-value/noisy. Distill means valuable but too raw or transcript-shaped.",
            "Do not finalize review. Return JSON only: {\"suggestions\":[{\"id\":\"...\",\"action\":\"keep\",\"confidence\":0.8,\"reason\":\"...\"}]}",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ engrams }) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  }));
  if (!response.ok) throw new Error(`suggestion model failed: ${response.status} ${response.statusText}`);
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  try {
    return normalizeDigestSuggestions(raw);
  } catch (err) {
    console.warn("mnemos-digest-suggest parse failed:", (err as Error).message);
    return [];
  }
}

function json(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
