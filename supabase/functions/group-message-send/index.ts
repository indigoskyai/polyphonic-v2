import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { ValidationError, wrapHandler } from "../_shared/errors.ts";
import {
  extractMentionKeys,
  jsonResponse,
  loadActiveMember,
  makeAgentHandle,
  notifyRoomMembers,
  readJson,
  requireAuthedContext,
  requireString,
  type GroupAgentRow,
} from "../_shared/group-rooms.ts";

function sanitizeAttachments(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 8)
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        bucket: row.bucket === "group-attachments" ? "group-attachments" : null,
        path: typeof row.path === "string" ? row.path : "",
        name: typeof row.name === "string" ? row.name.slice(0, 160) : "attachment",
        size: typeof row.size === "number" ? row.size : null,
        content_type: typeof row.content_type === "string" ? row.content_type : null,
      };
    })
    .filter((item) => item.bucket && item.path);
}

function canRequesterSummon(agent: GroupAgentRow, requesterUserId: string): { allowed: boolean; error?: string } {
  if (agent.mention_policy === "blocked") return { allowed: false, error: "This agent is not accepting group summons." };
  if (agent.mention_policy === "owner" && agent.owner_user_id !== requesterUserId) {
    return { allowed: false, error: "Only the agent owner can summon this agent." };
  }
  return { allowed: true };
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
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const attachments = sanitizeAttachments(body.attachments);
    if (!content && attachments.length === 0) throw new ValidationError("Message content or attachment is required.");
    await loadActiveMember(ctx.admin, roomId, ctx.userId);

    const clientMessageId = typeof body.client_message_id === "string" && body.client_message_id.trim()
      ? body.client_message_id.trim().slice(0, 120)
      : crypto.randomUUID();

    const { data: existing } = await ctx.admin
      .from("group_messages")
      .select("*")
      .eq("room_id", roomId)
      .eq("sender_user_id", ctx.userId)
      .eq("metadata->>client_message_id", clientMessageId)
      .maybeSingle();
    if (existing) return jsonResponse({ message: existing, duplicate: true, mentions: [], jobs: [] }, corsHeaders);

    const { data: message, error: messageError } = await ctx.admin
      .from("group_messages")
      .insert({
        room_id: roomId,
        sender_user_id: ctx.userId,
        role: "user",
        content,
        attachments,
        metadata: {
          client_message_id: clientMessageId,
          sender_kind: "human",
        },
      })
      .select("*")
      .single();
    if (messageError) throw messageError;

    const mentionKeys = extractMentionKeys(content);
    const { data: agents, error: agentsError } = await ctx.admin
      .from("group_room_agents")
      .select("*")
      .eq("room_id", roomId)
      .eq("state", "active");
    if (agentsError) throw agentsError;

    const agentByKey = new Map<string, GroupAgentRow>();
    for (const agent of (agents ?? []) as GroupAgentRow[]) {
      agentByKey.set(makeAgentHandle(agent), agent);
      agentByKey.set(agent.agent_id.toLowerCase(), agent);
      agentByKey.set(agent.display_name.toLowerCase(), agent);
    }

    const matchedAgents = mentionKeys
      .map((key) => agentByKey.get(key))
      .filter((agent): agent is GroupAgentRow => Boolean(agent));

    const mentionRows = matchedAgents.map((agent) => ({
      room_id: roomId,
      message_id: message.id,
      target_kind: "agent",
      target_agent_owner_user_id: agent.owner_user_id,
      target_agent_id: agent.agent_id,
    }));
    if (mentionRows.length) {
      const { error: mentionError } = await ctx.admin.from("group_message_mentions").insert(mentionRows);
      if (mentionError) throw mentionError;
    }

    const jobs: unknown[] = [];
    for (const agent of matchedAgents) {
      const policy = canRequesterSummon(agent, ctx.userId);
      const idempotencyKey = `room:${roomId}:message:${message.id}:agent:${agent.owner_user_id}:${agent.agent_id}`;
      const row = {
        room_id: roomId,
        trigger_message_id: message.id,
        requester_user_id: ctx.userId,
        agent_owner_user_id: agent.owner_user_id,
        agent_id: agent.agent_id,
        request_kind: "mention",
        status: policy.allowed ? "queued" : "failed",
        idempotency_key: idempotencyKey,
        error: policy.error ?? null,
        metadata: {
          mention_policy: agent.mention_policy,
          trigger_content_preview: content.slice(0, 240),
        },
      };
      const { data: job, error: jobError } = await ctx.admin
        .from("group_agent_jobs")
        .upsert(row, { onConflict: "idempotency_key" })
        .select("*")
        .single();
      if (jobError) throw jobError;
      jobs.push(job);
    }

    await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
      type: mentionRows.length ? "group_mention" : "group_message",
      title: mentionRows.length ? "Mention in a group room" : "New group room message",
      summary: content.slice(0, 180) || "Attachment shared.",
      content: { message_id: message.id, mentioned_agents: mentionRows.map((row) => row.target_agent_id) },
      includeActor: false,
      critical: mentionRows.length > 0,
    });

    return jsonResponse({ message, mentions: mentionRows, jobs }, corsHeaders);
  })(req);
});
