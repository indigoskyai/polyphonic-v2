import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  insertSystemMessage,
  jsonResponse,
  loadActiveMember,
  readJson,
  requireAuthedContext,
  requireString,
} from "../_shared/group-rooms.ts";

function normalizeVisibility(value: unknown): "private" | "room" {
  return value === "room" ? "room" : "private";
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = {
    ...getCorsHeaders(req),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  return wrapHandler(corsHeaders, async () => {
    if (req.method !== "POST") throw new ValidationError("Method not allowed");
    const ctx = await requireAuthedContext(req);
    const body = await readJson(req);
    const action = requireString(body.action, "action");
    const roomId = requireString(body.room_id, "room_id");
    const member = await loadActiveMember(ctx.admin, roomId, ctx.userId);

    if (action === "create") {
      const sourceMessageId = requireString(body.source_message_id, "source_message_id");
      const content = requireString(body.content, "content").slice(0, 2000);
      const visibility = normalizeVisibility(body.visibility);
      const agentId = typeof body.agent_id === "string" && body.agent_id.trim() ? body.agent_id.trim() : null;
      const { data: message, error: messageError } = await ctx.admin
        .from("group_messages")
        .select("id, created_at")
        .eq("room_id", roomId)
        .eq("id", sourceMessageId)
        .maybeSingle();
      if (messageError) throw messageError;
      if (!message) throw new ValidationError("Source message was not found.");
      if (!member.can_see_history_before_join && new Date(message.created_at).getTime() < new Date(member.joined_at).getTime()) {
        throw new ForbiddenError("That source message is not visible to you.");
      }

      const { data: candidate, error } = await ctx.admin
        .from("group_memory_candidates")
        .insert({
          room_id: roomId,
          source_message_id: sourceMessageId,
          user_id: visibility === "private" ? ctx.userId : null,
          agent_id: agentId,
          visibility,
          status: "pending",
          content,
          created_by_user_id: ctx.userId,
          metadata: { consent_model: "explicit_group_v1" },
        })
        .select("*")
        .single();
      if (error) throw error;
      return jsonResponse({ candidate }, corsHeaders);
    }

    if (action === "approve" || action === "reject") {
      const candidateId = requireString(body.candidate_id, "candidate_id");
      const { data: candidate, error: candidateError } = await ctx.admin
        .from("group_memory_candidates")
        .select("*")
        .eq("room_id", roomId)
        .eq("id", candidateId)
        .maybeSingle();
      if (candidateError) throw candidateError;
      if (!candidate) throw new ValidationError("Memory candidate was not found.");
      if (candidate.visibility === "private" && candidate.user_id !== ctx.userId) {
        throw new ForbiddenError("Only the private memory owner can review this candidate.");
      }

      const now = new Date().toISOString();
      const { data: updated, error } = await ctx.admin
        .from("group_memory_candidates")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          reviewed_by_user_id: ctx.userId,
          reviewed_at: now,
        })
        .eq("id", candidateId)
        .select("*")
        .single();
      if (error) throw error;

      if (action === "approve" && candidate.visibility === "private" && candidate.user_id) {
        await ctx.admin.from("memories").insert({
          user_id: candidate.user_id,
          content: candidate.content,
          memory_type: "fact",
          confidence: 0.75,
          confidence_source: "user_confirmed",
          provenance: {
            source: "group_room",
            room_id: roomId,
            group_memory_candidate_id: candidateId,
            source_message_id: candidate.source_message_id,
            approved_by_user_id: ctx.userId,
          },
          tags: ["group-room"],
          needs_confirmation: false,
        });
      }

      await insertSystemMessage(ctx.admin, roomId, action === "approve" ? "A memory candidate was approved." : "A memory candidate was rejected.", {
        event: action === "approve" ? "memory_candidate_approved" : "memory_candidate_rejected",
        actor_user_id: ctx.userId,
        candidate_id: candidateId,
        visibility: candidate.visibility,
      });
      return jsonResponse({ candidate: updated }, corsHeaders);
    }

    throw new ValidationError("Unsupported memory action.");
  })(req);
});
