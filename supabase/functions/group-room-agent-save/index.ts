import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  insertSystemMessage,
  jsonResponse,
  loadActiveMember,
  notifyRoomMembers,
  optionalString,
  readJson,
  requireAuthedContext,
  requireRoomManager,
  requireString,
} from "../_shared/group-rooms.ts";

type MentionPolicy = "owner" | "members" | "blocked";

function normalizeMentionPolicy(value: unknown): MentionPolicy {
  return value === "members" || value === "blocked" || value === "owner" ? value : "owner";
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
    const roomId = requireString(body.room_id, "room_id");
    const agentId = requireString(body.agent_id, "agent_id");
    const action = optionalString(body.action) || "upsert";
    await loadActiveMember(ctx.admin, roomId, ctx.userId);

    if (action === "remove") {
      let query = ctx.admin
        .from("group_room_agents")
        .select("*")
        .eq("room_id", roomId)
        .eq("agent_id", agentId);
      const requestedOwner = optionalString(body.owner_user_id);
      query = query.eq("owner_user_id", requestedOwner || ctx.userId);
      const { data: existing, error: existingError } = await query.maybeSingle();
      if (existingError) throw existingError;
      if (!existing) throw new ValidationError("Agent is not in this room.");
      if (existing.owner_user_id !== ctx.userId) {
        await requireRoomManager(ctx.admin, roomId, ctx.userId);
      }
      const { data: agent, error } = await ctx.admin
        .from("group_room_agents")
        .update({ state: "removed", removed_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      await insertSystemMessage(ctx.admin, roomId, `${existing.display_name || agentId} was removed from the room.`, {
        event: "agent_removed",
        actor_user_id: ctx.userId,
        agent_owner_user_id: existing.owner_user_id,
        agent_id: agentId,
      });
      return jsonResponse({ agent }, corsHeaders);
    }

    const ownerUserId = typeof body.owner_user_id === "string" && body.owner_user_id ? body.owner_user_id : ctx.userId;
    if (ownerUserId !== ctx.userId) {
      throw new ValidationError("Agents can only be added by their owner.");
    }

    const { data: config, error: configError } = await ctx.admin
      .from("agent_configs")
      .select("id, name, avatar_color, pending")
      .eq("user_id", ownerUserId)
      .eq("id", agentId)
      .maybeSingle();
    if (configError) throw configError;
    if (!config || config.pending) throw new ValidationError("That agent is not available.");

    const mentionPolicy = normalizeMentionPolicy(body.mention_policy);
    const { data: agent, error } = await ctx.admin
      .from("group_room_agents")
      .upsert({
        room_id: roomId,
        owner_user_id: ownerUserId,
        agent_id: agentId,
        display_name: config.name || agentId,
        avatar_color: config.avatar_color ?? null,
        mention_policy: mentionPolicy,
        state: "active",
        removed_at: null,
        added_by_user_id: ctx.userId,
      }, { onConflict: "room_id,owner_user_id,agent_id" })
      .select("*")
      .single();
    if (error) throw error;

    await insertSystemMessage(ctx.admin, roomId, `${agent.display_name} joined as an agent.`, {
      event: "agent_added",
      actor_user_id: ctx.userId,
      agent_owner_user_id: ownerUserId,
      agent_id: agentId,
      mention_policy: mentionPolicy,
    });
    await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
      type: "group_agent_added",
      title: "Agent added to room",
      summary: `${agent.display_name} can now participate in the room.`,
      content: { agent_id: agentId, agent_owner_user_id: ownerUserId, mention_policy: mentionPolicy },
      includeActor: false,
    });

    return jsonResponse({ agent }, corsHeaders);
  })(req);
});
