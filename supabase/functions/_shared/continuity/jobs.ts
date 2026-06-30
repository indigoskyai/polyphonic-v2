export type ContinuityJobClaim =
  | { claimed: true; id: string | null }
  | { claimed: false; reason: "missing_source_message_id" | "already_claimed" | "guard_unavailable" };

type SupabaseLike = {
  from: (table: string) => any;
};

function isDuplicateError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null | undefined;
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint");
}

function isMissingTableError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null | undefined;
  const msg = String(err?.message || "").toLowerCase();
  return err?.code === "42P01" || msg.includes("continuity_turn_jobs") && msg.includes("does not exist");
}

export async function claimContinuityJob(
  supabase: SupabaseLike,
  params: {
    userId: string;
    agentId: string;
    threadId: string;
    sourceMessageId?: string | null;
    jobName: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ContinuityJobClaim> {
  if (!params.sourceMessageId) return { claimed: false, reason: "missing_source_message_id" };

  const { data, error } = await supabase
    .from("continuity_turn_jobs")
    .insert({
      user_id: params.userId,
      agent_id: params.agentId || "luca",
      thread_id: params.threadId,
      source_message_id: params.sourceMessageId,
      job_name: params.jobName,
      status: "running",
      metadata: params.metadata || {},
    })
    .select("id")
    .single();

  if (error) {
    if (isDuplicateError(error)) return { claimed: false, reason: "already_claimed" };
    if (isMissingTableError(error)) {
      console.warn("[continuity.jobs] guard table unavailable; running without idempotency", error);
      return { claimed: true, id: null };
    }
    throw error;
  }

  return { claimed: true, id: data?.id || null };
}

export async function finishContinuityJob(
  supabase: SupabaseLike,
  jobId: string | null | undefined,
  status: "completed" | "failed",
  error?: unknown,
): Promise<void> {
  if (!jobId) return;
  const patch: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  };
  if (status === "failed" && error) {
    patch.error = error instanceof Error ? error.message : String(error);
  }
  const { error: updateError } = await supabase
    .from("continuity_turn_jobs")
    .update(patch)
    .eq("id", jobId);
  if (updateError) {
    console.warn("[continuity.jobs] failed to finish job", updateError);
  }
}
