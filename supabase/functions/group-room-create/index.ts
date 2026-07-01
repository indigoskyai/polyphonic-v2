import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  insertSystemMessage,
  jsonResponse,
  loadProfileSnapshot,
  optionalString,
  readJson,
  requireAuthedContext,
} from "../_shared/group-rooms.ts";

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
    const title = optionalString(body.title) || "New group room";
    const description = optionalString(body.description);
    const agentIds = Array.isArray(body.agent_ids)
      ? [...new Set(body.agent_ids.filter((id): id is string => typeof id === "string" && id.trim()).map((id) => id.trim()))]
      : [];

    const snapshot = await loadProfileSnapshot(ctx.admin, ctx.userId);
    const { data: room, error: roomError } = await ctx.admin
      .from("group_rooms")
      .insert({
        owner_user_id: ctx.userId,
        title: title.slice(0, 120),
        description,
        visibility: "invite_only",
        history_policy: "join_forward",
      })
      .select("*")
      .single();
    if (roomError) throw roomError;

    const { data: member, error: memberError } = await ctx.admin
      .from("group_room_members")
      .insert({
        room_id: room.id,
        user_id: ctx.userId,
        role: "owner",
        state: "active",
        joined_at: new Date().toISOString(),
        can_see_history_before_join: true,
        display_snapshot: snapshot,
      })
      .select("*")
      .single();
    if (memberError) throw memberError;

    let agents: unknown[] = [];
    if (agentIds.length) {
      const { data: configs, error: configsError } = await ctx.admin
        .from("agent_configs")
        .select("id, name, avatar_color")
        .eq("user_id", ctx.userId)
        .eq("pending", false)
        .in("id", agentIds);
      if (configsError) throw configsError;
      const rows = (configs ?? []).map((agent: { id: string; name?: string | null; avatar_color?: string | null }) => ({
        room_id: room.id,
        owner_user_id: ctx.userId,
        agent_id: agent.id,
        display_name: agent.name || agent.id,
        avatar_color: agent.avatar_color ?? null,
        mention_policy: "owner",
        state: "active",
        added_by_user_id: ctx.userId,
      }));
      if (rows.length) {
        const { data: inserted, error: insertAgentsError } = await ctx.admin
          .from("group_room_agents")
          .insert(rows)
          .select("*");
        if (insertAgentsError) throw insertAgentsError;
        agents = inserted ?? [];
      }
    }

    await insertSystemMessage(ctx.admin, room.id, "Room created.", {
      event: "room_created",
      actor_user_id: ctx.userId,
    });

    return jsonResponse({ room, member, agents }, corsHeaders);
  })(req);
});
