import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";
import { ForbiddenError, ValidationError, wrapHandler } from "../_shared/errors.ts";
import { withModelRetry } from "../_shared/modelRetry.ts";
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  jsonResponse,
  loadActiveMember,
  notifyRoomMembers,
  optionalString,
  readJson,
  requireAuthedContext,
  requireString,
  type ActiveMember,
  type GroupAgentRow,
} from "../_shared/group-rooms.ts";
import { buildModelAttachmentContent, persistPdfAnnotations } from "../_shared/attachments.ts";

interface GroupMessageRow {
  id: string;
  room_id: string;
  sender_user_id?: string | null;
  sender_agent_owner_user_id?: string | null;
  sender_agent_id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: unknown[];
  attachment_ids?: string[];
  metadata?: Record<string, unknown>;
  state: "visible" | "deleted";
  created_at: string;
}

function canRequesterSummon(agent: GroupAgentRow, requesterUserId: string): { allowed: boolean; error?: string } {
  if (agent.mention_policy === "blocked") return { allowed: false, error: "This agent is not accepting group summons." };
  if (agent.mention_policy === "owner" && agent.owner_user_id !== requesterUserId) {
    return { allowed: false, error: "Only the agent owner can summon this agent." };
  }
  return { allowed: true };
}

function readAssistantText(payload: unknown): string {
  const choice = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function visibleMessagesQuery(admin: any, roomId: string, member: ActiveMember) {
  let query = admin
    .from("group_messages")
    .select("*")
    .eq("room_id", roomId)
    .eq("state", "visible")
    .order("created_at", { ascending: false })
    .limit(42);
  if (!member.can_see_history_before_join) {
    query = query.gte("created_at", member.joined_at);
  }
  return query;
}

function speakerLabel(
  message: GroupMessageRow,
  membersByUser: Map<string, ActiveMember>,
  agentsByOwnerAndId: Map<string, GroupAgentRow>,
): string {
  if (message.role === "system") return "Room";
  if (message.role === "assistant") {
    const key = `${message.sender_agent_owner_user_id}:${message.sender_agent_id}`;
    const agent = agentsByOwnerAndId.get(key);
    const owner = message.sender_agent_owner_user_id
      ? membersByUser.get(message.sender_agent_owner_user_id)
      : null;
    const ownerName = typeof owner?.display_snapshot?.display_name === "string"
      ? owner.display_snapshot.display_name
      : "former owner";
    return `${agent?.display_name || message.sender_agent_id || "Agent"} · ${ownerName}`;
  }
  if (!message.sender_user_id) return "Former member";
  const member = membersByUser.get(message.sender_user_id);
  return typeof member?.display_snapshot?.display_name === "string" ? member.display_snapshot.display_name : "Member";
}

async function failJob(admin: any, jobId: string, message: string, metadata: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("group_agent_jobs")
    .update({
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
      metadata,
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
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
    const agentOwnerUserId = requireString(body.agent_owner_user_id, "agent_owner_user_id");
    const agentId = requireString(body.agent_id, "agent_id");
    const triggerMessageId = optionalString(body.trigger_message_id);
    const prompt = optionalString(body.prompt);
    const clientRequestId = optionalString(body.client_request_id) || crypto.randomUUID();
    const member = await loadActiveMember(ctx.admin, roomId, ctx.userId);

    const { data: agent, error: agentError } = await ctx.admin
      .from("group_room_agents")
      .select("*")
      .eq("room_id", roomId)
      .eq("owner_user_id", agentOwnerUserId)
      .eq("agent_id", agentId)
      .eq("state", "active")
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) throw new ForbiddenError("That agent is not active in this room.");

    const policy = canRequesterSummon(agent as GroupAgentRow, ctx.userId);
    if (!policy.allowed) throw new ForbiddenError(policy.error || "The agent cannot be summoned here.");

    let triggerMessage: GroupMessageRow | null = null;
    if (triggerMessageId) {
      const { data, error } = await ctx.admin
        .from("group_messages")
        .select("*")
        .eq("room_id", roomId)
        .eq("id", triggerMessageId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ValidationError("Trigger message was not found.");
      triggerMessage = data as GroupMessageRow;
      if (triggerMessage.role !== "user") throw new ValidationError("Agents only respond to human messages in group rooms.");
      if (new Date(triggerMessage.created_at).getTime() < new Date(agent.added_at).getTime()) {
        throw new ValidationError("That mention is from before the agent joined this room.");
      }
    } else if (!prompt) {
      throw new ValidationError("trigger_message_id or prompt is required.");
    }

    const idempotencyKey = triggerMessageId
      ? `room:${roomId}:message:${triggerMessageId}:agent:${agentOwnerUserId}:${agentId}`
      : `room:${roomId}:manual:${ctx.userId}:${agentOwnerUserId}:${agentId}:${clientRequestId}`;

    const { data: existingJob, error: existingJobError } = await ctx.admin
      .from("group_agent_jobs")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingJobError) throw existingJobError;
    if (existingJob && ["running", "complete", "failed"].includes(existingJob.status)) {
      return jsonResponse({ job: existingJob, duplicate: true }, corsHeaders);
    }

    const { data: job, error: jobError } = await ctx.admin
      .from("group_agent_jobs")
      .upsert({
        room_id: roomId,
        trigger_message_id: triggerMessageId,
        requester_user_id: ctx.userId,
        agent_owner_user_id: agentOwnerUserId,
        agent_id: agentId,
        request_kind: triggerMessageId ? "mention" : "manual",
        status: "running",
        idempotency_key: idempotencyKey,
        started_at: new Date().toISOString(),
        error: null,
        metadata: {
          mention_policy: agent.mention_policy,
          client_request_id: clientRequestId,
        },
      }, { onConflict: "idempotency_key" })
      .select("*")
      .single();
    if (jobError) throw jobError;

    try {
      const [{ data: config, error: configError }, { data: apiKeyData, error: keyError }] = await Promise.all([
        ctx.admin
          .from("agent_configs")
          .select("id, name, model, prompt, pending")
          .eq("user_id", agentOwnerUserId)
          .eq("id", agentId)
          .maybeSingle(),
        ctx.admin.rpc("decrypt_user_api_key", { p_user_id: agentOwnerUserId }),
      ]);
      if (configError) throw configError;
      if (!config || config.pending) {
        const failed = await failJob(ctx.admin, job.id, "The agent is disabled or no longer exists.", { reason: "agent_disabled" });
        return jsonResponse({ job: failed }, corsHeaders);
      }
      if (keyError) throw keyError;
      const apiKey = typeof apiKeyData === "string" ? apiKeyData.trim() : "";
      if (!apiKey) {
        const failed = await failJob(ctx.admin, job.id, "The agent owner has not connected an OpenRouter key.", { reason: "missing_api_key" });
        await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
          type: "group_agent_failed",
          title: "Agent reply failed",
          summary: `${agent.display_name} needs the owner's OpenRouter key before replying.`,
          content: { job_id: job.id, agent_id: agentId, agent_owner_user_id: agentOwnerUserId },
          includeActor: true,
          critical: true,
        });
        return jsonResponse({ job: failed }, corsHeaders);
      }

      try {
        await checkAndIncrement(agentOwnerUserId, "byok-chat-message", 500);
      } catch (quotaError) {
        const message = quotaError instanceof Error ? quotaError.message : "The agent owner has reached today's quota.";
        const failed = await failJob(ctx.admin, job.id, message, { reason: "quota_exceeded" });
        await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
          type: "group_agent_failed",
          title: "Agent reply failed",
          summary: `${agent.display_name} could not reply because the owner's daily quota was reached.`,
          content: { job_id: job.id, agent_id: agentId, agent_owner_user_id: agentOwnerUserId },
          includeActor: true,
          critical: true,
        });
        return jsonResponse({ job: failed }, corsHeaders);
      }

      const [{ data: members }, { data: agents }, { data: transcriptDesc, error: transcriptError }] = await Promise.all([
        ctx.admin.from("group_room_members").select("*").eq("room_id", roomId),
        ctx.admin.from("group_room_agents").select("*").eq("room_id", roomId),
        visibleMessagesQuery(ctx.admin, roomId, member),
      ]);
      if (transcriptError) throw transcriptError;

      const membersByUser = new Map<string, ActiveMember>();
      for (const roomMember of (members ?? []) as ActiveMember[]) membersByUser.set(roomMember.user_id, roomMember);
      const agentsByOwnerAndId = new Map<string, GroupAgentRow>();
      for (const roomAgent of (agents ?? []) as GroupAgentRow[]) {
        agentsByOwnerAndId.set(`${roomAgent.owner_user_id}:${roomAgent.agent_id}`, roomAgent);
      }

      const transcript = ((transcriptDesc ?? []) as GroupMessageRow[]).reverse();
      const transcriptBlock = transcript
        .map((message) => {
          const label = speakerLabel(message, membersByUser, agentsByOwnerAndId);
          const attachmentCount = Array.isArray(message.attachments) ? message.attachments.length : 0;
          const attachmentNote = attachmentCount ? ` [${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}]` : "";
          const text = message.state === "deleted" ? "[deleted]" : message.content;
          return `${label}: ${text}${attachmentNote}`;
        })
        .join("\n");

      const systemPrompt = [
        `You are ${agent.display_name}, participating in a Polyphonic group room.`,
        `Your owner is ${agentOwnerUserId}. Your visible label is "${agent.display_name} · owner".`,
        "Reply only as yourself. Do not impersonate the owner or any other member.",
        "Use only the room transcript visible to the requester and the current trigger. Do not reveal private owner memory as room facts.",
        "If private owner memory influences tone, keep it implicit and never cite it as evidence.",
        "High-risk tools are unavailable in group rooms: browser, workspace, social posting, local runtime, and external actions are blocked.",
        "Do not respond to agent messages, your own messages, stale mentions, or loops.",
        "Be concise and conversational. If the right response is a clarification, ask it directly.",
        config.prompt ? `\nYour standing agent instructions:\n${config.prompt}` : "",
      ].filter(Boolean).join("\n");

      const triggerText = triggerMessage
        ? `The trigger was this human message:\n${speakerLabel(triggerMessage, membersByUser, agentsByOwnerAndId)}: ${triggerMessage.content}`
        : `The requester asks:\n${prompt}`;
      const triggerAttachmentIds = Array.isArray(triggerMessage?.attachment_ids) ? triggerMessage!.attachment_ids! : [];
      const model = config.model || "anthropic/claude-opus-4-7";
      const attachmentBundle = await buildModelAttachmentContent(
        ctx.admin,
        ctx.userId,
        triggerAttachmentIds,
        model,
        apiKey,
      );
      const userText = `Room transcript:\n${transcriptBlock || "(No visible prior messages.)"}\n\n${triggerText}${attachmentBundle.promptContext}\n\nRespond in the room now.`;
      const messages: Array<Record<string, unknown>> = [{ role: "system", content: systemPrompt }];
      if (attachmentBundle.cachedAnnotations.length) {
        messages.push({
          role: "assistant",
          content: "Previously parsed attachment material is available for reuse.",
          annotations: attachmentBundle.cachedAnnotations,
        });
      }
      messages.push({
        role: "user",
        content: attachmentBundle.parts.length
          ? [{ type: "text", text: userText }, ...attachmentBundle.parts]
          : userText,
      });

      const response = await withModelRetry(() => fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://polyphonic.chat",
          "X-Title": "Polyphonic Group Rooms",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 1200,
        }),
        signal: AbortSignal.timeout(60_000),
      }));

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const failed = await failJob(ctx.admin, job.id, `OpenRouter error ${response.status}: ${text.slice(0, 300)}`, {
          reason: "upstream_error",
          status: response.status,
        });
        return jsonResponse({ job: failed }, corsHeaders);
      }

      const payload = await response.json();
      const responseAnnotations = Array.isArray(payload?.choices?.[0]?.message?.annotations)
        ? payload.choices[0].message.annotations
        : [];
      await persistPdfAnnotations(ctx.admin, ctx.userId, triggerAttachmentIds, responseAnnotations)
        .catch((error) => console.warn("[group-agent-request] could not persist PDF annotations", error));
      const assistantText = readAssistantText(payload);
      if (!assistantText) {
        const failed = await failJob(ctx.admin, job.id, "The model returned an empty reply.", { reason: "empty_reply" });
        return jsonResponse({ job: failed }, corsHeaders);
      }

      const { data: assistantMessage, error: assistantError } = await ctx.admin
        .from("group_messages")
        .insert({
          room_id: roomId,
          role: "assistant",
          sender_agent_owner_user_id: agentOwnerUserId,
          sender_agent_id: agentId,
          content: assistantText,
          metadata: {
            provenance: {
              owner_user_id: agentOwnerUserId,
              agent_id: agentId,
              requested_by_user_id: ctx.userId,
              trigger_message_id: triggerMessageId,
              group_agent_job_id: job.id,
            },
            privacy: {
              room_transcript_only: true,
              private_memory_not_disclosed_as_room_fact: true,
              high_risk_tools_blocked: true,
            },
            model,
          },
        })
        .select("*")
        .single();
      if (assistantError) throw assistantError;

      const { data: completed, error: completedError } = await ctx.admin
        .from("group_agent_jobs")
        .update({
          status: "complete",
          response_message_id: assistantMessage.id,
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.id)
        .select("*")
        .single();
      if (completedError) throw completedError;

      await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
        type: "group_agent_replied",
        title: `${agent.display_name} replied`,
        summary: assistantText.slice(0, 180),
        content: { job_id: job.id, message_id: assistantMessage.id, agent_id: agentId, agent_owner_user_id: agentOwnerUserId },
        includeActor: false,
      });

      return jsonResponse({ job: completed, message: assistantMessage }, corsHeaders);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent reply failed.";
      const failed = await failJob(ctx.admin, job.id, message, { reason: "runtime_error" });
      await notifyRoomMembers(ctx.admin, roomId, ctx.userId, {
        type: "group_agent_failed",
        title: "Agent reply failed",
        summary: `${agent.display_name} could not reply.`,
        content: { job_id: job.id, agent_id: agentId, agent_owner_user_id: agentOwnerUserId, error: message },
        includeActor: true,
        critical: true,
      });
      return jsonResponse({ job: failed }, corsHeaders);
    }
  })(req);
});
