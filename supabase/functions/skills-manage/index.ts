// skills-manage — authenticated user controls for Luca's procedural skills.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { normalizeSkillName } from "../_shared/agents/skills.ts";

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

    const { action, skill_id, candidate_id, name } = await req.json();
    if (!["rename", "delete", "reject", "approve_candidate", "reject_candidate"].includes(action)) {
      return json({ error: "Invalid skill action" }, 400, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "approve_candidate" || action === "reject_candidate") {
      if (!candidate_id) return json({ error: "Missing candidate id" }, 400, corsHeaders);
      const { data: candidate, error: candidateLoadError } = await supabase
        .from("agent_skill_candidates")
        .select("id, user_id, agent_id, name, description, trigger_keywords, content, source_thread_id")
        .eq("id", candidate_id)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();

      if (candidateLoadError) {
        console.warn("[skills-manage] candidate load failed:", candidateLoadError);
        return json({ error: "Could not load candidate" }, 500, corsHeaders);
      }
      if (!candidate) return json({ error: "Candidate not found" }, 404, corsHeaders);

      if (action === "approve_candidate") {
        const { error: upsertError } = await supabase
          .from("agent_skills")
          .upsert({
            user_id: user.id,
            agent_id: candidate.agent_id,
            name: candidate.name,
            description: candidate.description,
            trigger_keywords: candidate.trigger_keywords || [],
            content: candidate.content,
            source_thread_id: candidate.source_thread_id,
          }, { onConflict: "user_id,agent_id,name" });

        if (upsertError) {
          console.warn("[skills-manage] candidate approve failed:", upsertError);
          return json({ error: "Could not approve candidate" }, 500, corsHeaders);
        }

        const { error: candidateUpdateError } = await supabase
          .from("agent_skill_candidates")
          .update({ status: "approved", reviewed_at: new Date().toISOString() })
          .eq("id", candidate.id)
          .eq("user_id", user.id);

        if (candidateUpdateError) {
          console.warn("[skills-manage] candidate approved but status update failed:", candidateUpdateError);
          return json({ error: "Candidate was approved, but review status could not be updated" }, 500, corsHeaders);
        }

        return json({ ok: true, skill: candidate.name }, 200, corsHeaders);
      }

      const { error: denialError } = await supabase
        .from("agent_skill_denials")
        .upsert({
          user_id: user.id,
          agent_id: candidate.agent_id,
          skill_name: candidate.name,
          description: candidate.description,
        }, { onConflict: "user_id,agent_id,skill_name" });

      if (denialError) {
        console.warn("[skills-manage] candidate denial write failed:", denialError);
        return json({ error: "Could not reject candidate" }, 500, corsHeaders);
      }

      const { error: rejectError } = await supabase
        .from("agent_skill_candidates")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("user_id", user.id);

      if (rejectError) {
        console.warn("[skills-manage] candidate reject failed:", rejectError);
        return json({ error: "Could not reject candidate" }, 500, corsHeaders);
      }

      return json({ ok: true }, 200, corsHeaders);
    }

    if (!skill_id) {
      return json({ error: "Missing skill id" }, 400, corsHeaders);
    }

    const { data: skill, error: loadError } = await supabase
      .from("agent_skills")
      .select("id, user_id, agent_id, name, description")
      .eq("id", skill_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      console.warn("[skills-manage] load failed:", loadError);
      return json({ error: "Could not load skill" }, 500, corsHeaders);
    }
    if (!skill) return json({ error: "Skill not found" }, 404, corsHeaders);

    if (action === "rename") {
      const normalizedName = normalizeSkillName(String(name || ""));
      if (!normalizedName || normalizedName === "luca-skill") {
        return json({ error: "Give the skill a clearer name." }, 400, corsHeaders);
      }

      const { error } = await supabase
        .from("agent_skills")
        .update({ name: normalizedName })
        .eq("id", skill.id)
        .eq("user_id", user.id);

      if (error) {
        const conflict = String(error.message || "").toLowerCase().includes("duplicate");
        return json({ error: conflict ? "A skill with that name already exists." : "Could not rename skill" }, conflict ? 409 : 500, corsHeaders);
      }

      return json({ ok: true, name: normalizedName }, 200, corsHeaders);
    }

    if (action === "reject") {
      await supabase
        .from("agent_skill_denials")
        .upsert({
          user_id: user.id,
          agent_id: skill.agent_id,
          skill_name: skill.name,
          description: skill.description,
          source_skill_id: skill.id,
        }, { onConflict: "user_id,agent_id,skill_name" });
    }

    const { error: deleteError } = await supabase
      .from("agent_skills")
      .delete()
      .eq("id", skill.id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.warn("[skills-manage] delete failed:", deleteError);
      return json({ error: "Could not delete skill" }, 500, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[skills-manage] error:", err);
    return json({ error: "Internal error" }, 500, corsHeaders);
  }
});

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
