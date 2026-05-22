/**
 * Activity Gate — "Should this cognitive process run right now?"
 *
 * Each cognitive edge function calls evaluate() at entry.
 * The gate checks recent activity signals from the database
 * and decides whether there's reason to run. Zero LLM calls.
 *
 * If nothing meaningful has happened, the process skips gracefully.
 * If urgency is high (> 0.8), the process runs with elevated context.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSubstrateAgentId, normalizeAgentId } from "./agent-scope.ts";

export interface GateResult {
  shouldRun: boolean;
  reason: string;
  urgency: number; // 0-1, passed to LLM prompt when > 0.8
}

interface ProcessConfig {
  cooldownMs: number;
  signals: SignalCheck[];
}

type SignalCheck = (
  ctx: SignalContext
) => { active: boolean; reason: string; urgency: number };

interface SignalContext {
  recentMessageCount: number;
  recentJournalCount: number;
  recentThoughtCount: number;
  avgThoughtRate24h: number;
  emotionalShift: number;
  stagnantBeliefCount: number;
  highSalienceQuestionCount: number;
  newMemoriesSinceLastRun: number;
  msSinceLastMessage: number;
  msSinceLastRun: number;
}

// ─── Signal check functions ───

const hasRecentConversation = (windowMs: number): SignalCheck => (ctx) => ({
  active: ctx.msSinceLastMessage < windowMs,
  reason: "recent conversation activity",
  urgency: ctx.msSinceLastMessage < windowMs / 2 ? 0.6 : 0.4,
});

const hasEmotionalShift = (threshold: number): SignalCheck => (ctx) => ({
  active: ctx.emotionalShift > threshold,
  reason: `emotional shift of ${ctx.emotionalShift.toFixed(2)} (threshold: ${threshold})`,
  urgency: Math.min(1, ctx.emotionalShift / 0.3),
});

const hasStagnantBeliefs = (minCount: number): SignalCheck => (ctx) => ({
  active: ctx.stagnantBeliefCount >= minCount,
  reason: `${ctx.stagnantBeliefCount} stagnant beliefs`,
  urgency: 0.5,
});

const hasNewThoughts: SignalCheck = (ctx) => ({
  active: ctx.recentThoughtCount > 0,
  reason: `${ctx.recentThoughtCount} new thoughts since last run`,
  urgency: 0.4,
});

const hasNewJournals: SignalCheck = (ctx) => ({
  active: ctx.recentJournalCount > 0,
  reason: `${ctx.recentJournalCount} new journal entries`,
  urgency: 0.5,
});

const hasNewMemories: SignalCheck = (ctx) => ({
  active: ctx.newMemoriesSinceLastRun > 0,
  reason: `${ctx.newMemoriesSinceLastRun} new memories since last run`,
  urgency: 0.4,
});

const hasHighSalienceQuestions = (minCount: number): SignalCheck => (ctx) => ({
  active: ctx.highSalienceQuestionCount >= minCount,
  reason: `${ctx.highSalienceQuestionCount} high-salience unanswered questions`,
  urgency: 0.7,
});

// ─── Process configurations ───

const PROCESS_CONFIGS: Record<string, ProcessConfig> = {
  think: {
    cooldownMs: 1 * 3600000, // 1h
    signals: [
      hasRecentConversation(2 * 3600000), // message in last 2h
      hasEmotionalShift(0.1),
      hasStagnantBeliefs(2),
      hasHighSalienceQuestions(1),
    ],
  },
  reflect: {
    cooldownMs: 4 * 3600000, // 4h
    signals: [
      hasNewThoughts,
      hasEmotionalShift(0.15),
      hasNewJournals,
    ],
  },
  question: {
    cooldownMs: 8 * 3600000, // 8h
    signals: [
      hasNewThoughts,
      hasNewJournals,
      hasRecentConversation(4 * 3600000),
    ],
  },
  connect: {
    cooldownMs: 6 * 3600000, // 6h
    signals: [
      hasNewMemories,
      hasNewThoughts,
    ],
  },
  // observe, dream, consolidate, believe — not gated here (have their own logic)
};

export async function evaluate(
  supabase: SupabaseClient,
  userId: string,
  processName: string,
  agentId = "luca",
): Promise<GateResult> {
  const scopedAgentId = normalizeAgentId(agentId);
  if (!isSubstrateAgentId(scopedAgentId)) {
    return {
      shouldRun: false,
      reason: `${scopedAgentId} is an observer sidecar, not an autonomous substrate agent`,
      urgency: 0,
    };
  }

  const config = PROCESS_CONFIGS[processName];

  // If no config for this process, always run (ungated processes)
  if (!config) {
    return { shouldRun: true, reason: "ungated process", urgency: 0 };
  }

  try {
    const now = Date.now();
    const since2h = new Date(now - 2 * 3600000).toISOString();
    const since24h = new Date(now - 24 * 3600000).toISOString();

    // Parallel data fetch — all the signals we need
    const [
      { data: lastRunLog },
      { count: recentMessagesCount },
      { count: recentJournalsCount },
      { count: recentThoughtsCount },
      { count: thoughts24hCount },
      { count: stagnantBeliefsCount },
      { count: highSalQuestionsCount },
      { data: emotionalState },
      { data: lastEmotionalHistory },
      { count: newMemoriesCount },
    ] = await Promise.all([
      // Last time this process ran
      supabase
        .from("activity_events")
        .select("created_at")
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .eq("event_type", "process_ran")
        .eq("metadata->>process", processName)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Recent messages
      supabase
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .or(`agent_id.eq.${scopedAgentId},primary_agent_id.eq.${scopedAgentId}`)
        .gte("updated_at", since2h),
      // Recent journals
      supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .gte("created_at", since2h),
      // Recent thoughts (since last run, or last 2h)
      supabase
        .from("thought_stream")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .gte("created_at", since2h),
      // Thoughts in last 24h (for velocity)
      supabase
        .from("thought_stream")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .gte("created_at", since24h),
      // Stagnant beliefs
      supabase
        .from("beliefs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .eq("active", true)
        .eq("stagnant", true),
      // High-salience unanswered questions
      supabase
        .from("curiosity_questions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .eq("status", "pending")
        .gte("curiosity_score", 0.7),
      // Current emotional state
      supabase
        .from("emotional_state")
        .select("curiosity, restlessness, warmth, clarity, creative_flow, isolation")
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .maybeSingle(),
      // Previous emotional history (for delta)
      supabase
        .from("emotional_history")
        .select("state")
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .order("timestamp", { ascending: false })
        .limit(2),
      // New memories since 2h ago
      supabase
        .from("memories")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("agent_id", scopedAgentId)
        .eq("is_deleted", false)
        .gte("created_at", since2h),
    ]);

    // Check cooldown
    const lastRunAt = lastRunLog?.created_at
      ? new Date(lastRunLog.created_at).getTime()
      : 0;
    const msSinceLastRun = now - lastRunAt;

    if (msSinceLastRun < config.cooldownMs) {
      return {
        shouldRun: false,
        reason: `cooldown: ${Math.round((config.cooldownMs - msSinceLastRun) / 60000)}min remaining`,
        urgency: 0,
      };
    }

    // Calculate emotional shift (max delta across dimensions)
    let emotionalShift = 0;
    if (emotionalState && lastEmotionalHistory && lastEmotionalHistory.length >= 2) {
      const prev = lastEmotionalHistory[1]?.state as Record<string, number> | undefined;
      if (prev) {
        const dims = ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"];
        for (const d of dims) {
          const delta = Math.abs((emotionalState as any)[d] - (prev[d] ?? 0.5));
          if (delta > emotionalShift) emotionalShift = delta;
        }
      }
    }

    // Find most recent message time
    // We need the actual timestamp for msSinceLastMessage
    const { data: lastMsg } = await supabase
      .from("threads")
      .select("updated_at")
      .eq("user_id", userId)
      .or(`agent_id.eq.${scopedAgentId},primary_agent_id.eq.${scopedAgentId}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const msSinceLastMessage = lastMsg?.updated_at
      ? now - new Date(lastMsg.updated_at).getTime()
      : Infinity;

    // Build signal context
    const ctx: SignalContext = {
      recentMessageCount: recentMessagesCount ?? 0,
      recentJournalCount: recentJournalsCount ?? 0,
      recentThoughtCount: recentThoughtsCount ?? 0,
      avgThoughtRate24h: (thoughts24hCount ?? 0) / 24,
      emotionalShift,
      stagnantBeliefCount: stagnantBeliefsCount ?? 0,
      highSalienceQuestionCount: highSalQuestionsCount ?? 0,
      newMemoriesSinceLastRun: newMemoriesCount ?? 0,
      msSinceLastMessage,
      msSinceLastRun,
    };

    // Evaluate signals — any active signal means we should run
    let maxUrgency = 0;
    const activeReasons: string[] = [];

    for (const signal of config.signals) {
      const result = signal(ctx);
      if (result.active) {
        activeReasons.push(result.reason);
        if (result.urgency > maxUrgency) maxUrgency = result.urgency;
      }
    }

    if (activeReasons.length === 0) {
      return {
        shouldRun: false,
        reason: "no meaningful activity detected",
        urgency: 0,
      };
    }

    return {
      shouldRun: true,
      reason: activeReasons.join("; "),
      urgency: maxUrgency,
    };
  } catch (err) {
    // Graceful degradation: if gate fails, run anyway
    console.error(`Activity gate error for ${processName}:`, err);
    return { shouldRun: true, reason: "gate error — defaulting to run", urgency: 0 };
  }
}

/**
 * Log that a cognitive process ran. Called after successful output.
 */
export async function logProcessRan(
  supabase: SupabaseClient,
  userId: string,
  processName: string,
  metadata: Record<string, unknown> = {},
  agentId = "luca",
): Promise<void> {
  try {
    const scopedAgentId = normalizeAgentId(agentId);
    if (!isSubstrateAgentId(scopedAgentId)) return;

    const { error } = await supabase.from("activity_events").insert({
      user_id: userId,
      agent_id: scopedAgentId,
      event_type: "process_ran",
      metadata: { process: processName, ...metadata },
    });
    if (error) console.error(`[activity-gate] logProcessRan(${processName}) failed:`, error);
  } catch (err) {
    console.error(`Failed to log activity event for ${processName}:`, err);
  }
}

/**
 * Log a meaningful activity event (conversation, memory formed, etc.)
 */
export async function logActivityEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  agentId = "luca",
): Promise<void> {
  try {
    const scopedAgentId = normalizeAgentId(agentId);
    if (!isSubstrateAgentId(scopedAgentId)) return;

    const { error } = await supabase.from("activity_events").insert({
      user_id: userId,
      agent_id: scopedAgentId,
      event_type: eventType,
      metadata,
    });
    if (error) console.error(`[activity-gate] logActivityEvent(${eventType}) failed:`, error);
  } catch (err) {
    console.error(`Failed to log activity event ${eventType}:`, err);
  }
}
