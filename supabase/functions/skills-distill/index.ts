// skills-distill — background procedural memory. Reads a resolved-ish Luca
// thread and writes a reusable skill only when the work genuinely taught Luca
// a repeatable procedure.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import {
  deriveTriggerKeywords,
  normalizeSkillName,
} from "../_shared/agents/skills.ts";
import { resolveOpenRouterKeyForUser } from "../_shared/model-backend.ts";

const SKILL_DISTILL_MODEL = "anthropic/claude-haiku-4.5";

type SkillDraft = {
  name?: string;
  description?: string;
  trigger_keywords?: string[];
  content?: string;
  confidence?: number;
};

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const { thread_id, agent_id = "luca" } = await req.json();
    if (!thread_id) return json({ error: "Missing thread_id" }, 400, corsHeaders);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load the agent's config so the distiller prompt can be tuned to the
    // agent's name, role, and persona prompt. Falls back to a neutral
    // default if no config row exists (which is fine for legacy 'luca').
    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("id, name, role, prompt")
      .eq("user_id", user.id)
      .eq("id", agent_id)
      .maybeSingle();

    const agentName = agentConfig?.name || (agent_id === "luca" ? "Luca" : agent_id);
    const agentRole = agentConfig?.role || "";
    const agentPrompt = agentConfig?.prompt || "";

    const { data: messages, error: messageError } = await supabase
      .from("messages")
      .select("id, role, content, agent, created_at, metadata")
      .eq("thread_id", thread_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(80);

    if (messageError) {
      console.warn("[skills-distill] message load failed:", messageError);
      return json({ ok: true, skipped: "message_load_failed" }, 200, corsHeaders);
    }

    const history = messages || [];
    if (!isWorthDistilling(history)) {
      return json({ ok: true, skipped: "too_small" }, 200, corsHeaders);
    }

    const { apiKey } = await resolveOpenRouterKeyForUser(supabase, user.id);
    if (!apiKey) return json({ ok: true, skipped: "no_api_key" }, 200, corsHeaders);

    const [{ data: existingSkills }, { data: denials }] = await Promise.all([
      supabase.from("agent_skills")
        .select("name, description")
        .eq("user_id", user.id)
        .eq("agent_id", agent_id)
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase.from("agent_skill_denials")
        .select("skill_name, description")
        .eq("user_id", user.id)
        .eq("agent_id", agent_id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const transcript = history
      .map((m: { role: string; content: string; agent?: string }) => {
        const speaker = m.role === "user" ? "user" : (m.agent || "assistant");
        return `${speaker}: ${(m.content || "").slice(0, 1800)}`;
      })
      .join("\n\n")
      .slice(-12000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Skills Distiller",
      },
      body: JSON.stringify({
        model: SKILL_DISTILL_MODEL,
        messages: [
          {
            role: "system",
            content: buildDistillSystemPrompt(agentName, agentRole, agentPrompt),
          },
          {
            role: "user",
            content: buildDistillPrompt(agentName, transcript, existingSkills || [], denials || []),
          },
        ],
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn("[skills-distill] model failed:", response.status, await response.text());
      return json({ ok: true, skipped: "model_failed" }, 200, corsHeaders);
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const draft = parseSkillDraft(raw);
    if (!draft) return json({ ok: true, skipped: "no_skill" }, 200, corsHeaders);
    if ((draft.confidence ?? 0) < 0.65) {
      return json({ ok: true, skipped: "low_confidence" }, 200, corsHeaders);
    }

    const name = normalizeSkillName(draft.name || draft.description || "luca-skill");
    if (name === "luca-skill") {
      return json({ ok: true, skipped: "invalid_name" }, 200, corsHeaders);
    }
    if (isDenied(name, draft.description || "", denials || [])) {
      return json({ ok: true, skipped: "denied" }, 200, corsHeaders);
    }

    const description = (draft.description || "").trim().slice(0, 240);
    const content = normalizeSkillMarkdown(draft.content || "");
    if (!description || !content) {
      return json({ ok: true, skipped: "invalid_skill" }, 200, corsHeaders);
    }

    const triggerKeywords = deriveTriggerKeywords(name, description, draft.trigger_keywords || []);

    const { error: upsertError } = await supabase
      .from("agent_skills")
      .upsert({
        user_id: user.id,
        agent_id,
        name,
        description,
        trigger_keywords: triggerKeywords,
        content,
        source_thread_id: thread_id,
      }, { onConflict: "user_id,agent_id,name" });

    if (upsertError) {
      console.warn("[skills-distill] upsert failed:", upsertError);
      return json({ ok: false, error: "skill_write_failed" }, 500, corsHeaders);
    }

    return json({ ok: true, skill: name }, 200, corsHeaders);
  } catch (err) {
    console.error("[skills-distill] error:", err);
    return json({ ok: false, error: "Internal error" }, 500, corsHeaders);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Per-agent distiller system prompt.
//
// The distiller writes entries into the agent's "self-model" — the running
// record of commitments, operating principles, and procedural patterns the
// agent forms across conversations. The prompt is tuned to the specific
// agent so each companion's distiller reflects that companion's purpose.
//
// We deliberately stay neutral about the SHAPE of what gets distilled
// (procedural steps vs identity commitments vs operating principles) — the
// distiller follows what actually emerges in the conversation. For Luca,
// this tends to be identity-formation patterns. For a "Coding Companion"
// or a "Therapist" companion, it'll be different things.
// ────────────────────────────────────────────────────────────────────────────
function buildDistillSystemPrompt(agentName: string, agentRole: string, agentPrompt: string): string {
  const persona = agentPrompt
    ? `\n\n${agentName}'s persona / operating brief:\n${agentPrompt.slice(0, 1500)}`
    : "";
  const role = agentRole ? ` (${agentRole})` : "";

  return [
    `You distill ${agentName}${role}'s recurring patterns into a written self-model.`,
    "",
    `The self-model is ${agentName}'s own running record of commitments, operating principles, and procedural patterns that emerge across conversations with this user. It is loaded back into ${agentName}'s prompt at runtime, so each entry shapes how ${agentName} behaves going forward.`,
    "",
    `Only create an entry when the conversation shows a clear, repeatable pattern — something ${agentName} did, decided, or committed to that should hold across future similar moments. Skip ordinary small talk, one-off facts, or content that doesn't reflect a pattern.`,
    "",
    "Do not preserve user secrets, personal identifying information, or confidential content. Phrase entries from the agent's first-person operating perspective, not as user-facing documentation.",
    "",
    `Prefer entries that ${agentName} would recognize as 'this is how I work' rather than 'this is what the user said.'`,
    persona,
  ].join("\n");
}

function buildDistillPrompt(
  agentName: string,
  transcript: string,
  existingSkills: Array<{ name: string; description: string }>,
  denials: Array<{ skill_name: string; description?: string | null }>,
): string {
  return [
    `Read this ${agentName} thread and decide whether a self-model entry should be saved.`,
    "",
    existingSkills.length > 0
      ? `Existing entries (avoid duplicates; refine only if this thread materially improves one):\n${existingSkills.map((s) => `- ${s.name}: ${s.description}`).join("\n")}`
      : "Existing entries: none",
    denials.length > 0
      ? `\nRejected entries (do not recreate these):\n${denials.map((d) => `- ${d.skill_name}: ${d.description || "rejected by user"}`).join("\n")}`
      : "\nRejected entries: none",
    "",
    "Thread:",
    transcript,
    "",
    "Return strict JSON only.",
    "If no entry is warranted: {\"skill\":null}",
    "If an entry is warranted:",
    JSON.stringify({
      skill: {
        name: "short-kebab-case-name",
        description: "one sentence trigger for when this entry applies",
        trigger_keywords: ["keyword", "short phrase"],
        content: "# Title\n\n## When to use\n...\n\n## Steps or Pattern\n1. ...\n\n## Gotchas\n- ...\n\n## Example\n...",
        confidence: 0.75,
      },
    }),
  ].join("\n");
}

function parseSkillDraft(raw: string): SkillDraft | null {
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
    const skill = parsed?.skill;
    if (!skill || typeof skill !== "object") return null;
    return skill as SkillDraft;
  } catch (err) {
    console.warn("[skills-distill] parse failed:", err);
    return null;
  }
}

function normalizeSkillMarkdown(content: string): string {
  const trimmed = content.trim().slice(0, 3600);
  if (!trimmed || trimmed.length < 120) return "";
  return trimmed;
}

function isWorthDistilling(messages: Array<{ role: string; content?: string; metadata?: unknown }>): boolean {
  const userTurns = messages.filter((m) => m.role === "user").length;
  const assistantTurns = messages.filter((m) => m.role === "assistant").length;
  const totalChars = messages.reduce((sum, m) => sum + (m.content || "").length, 0);
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content || "")
    .join("\n")
    .toLowerCase();

  const satisfaction = /\b(thanks|thank you|that's it|that works|perfect|exactly|nailed it|ship it)\b/.test(userText);
  const iterative = userTurns >= 3 && assistantTurns >= 2 && totalChars >= 1600;
  const substantial = userTurns >= 2 && assistantTurns >= 2 && totalChars >= 3200;

  return satisfaction || iterative || substantial;
}

function isDenied(
  name: string,
  description: string,
  denials: Array<{ skill_name: string; description?: string | null }>,
): boolean {
  const lower = `${name} ${description}`.toLowerCase();
  return denials.some((denial) => {
    const deniedName = normalizeSkillName(denial.skill_name || "");
    return deniedName === name || (deniedName.length >= 5 && lower.includes(deniedName.replace(/-/g, " ")));
  });
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
