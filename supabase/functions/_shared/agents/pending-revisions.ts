export type PendingRevision = {
  id: string;
  revision_type: string;
  what_was_said: string;
  what_to_say_now: string;
  rationale: string | null;
  created_at: string;
};

type SupabaseLike = {
  from: (table: string) => any;
};

const REVISION_CLASSIFIER_MODEL = "anthropic/claude-haiku-4.5";

export async function loadPendingRevisions(
  supabase: SupabaseLike,
  userId: string,
  threadId: string,
): Promise<PendingRevision[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pending_revisions")
    .select("id, revision_type, what_was_said, what_to_say_now, rationale, created_at")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.warn("[pending-revisions] load failed:", error);
    return [];
  }

  return (data || []) as PendingRevision[];
}

export function formatPendingRevisionsPrompt(revisions: PendingRevision[]): string {
  if (revisions.length === 0) return "";

  const lines = revisions.map((revision, index) => [
    `${index + 1}. Earlier you said: ${revision.what_was_said}`,
    `   On reflection: ${revision.what_to_say_now}`,
    revision.rationale ? `   Why: ${revision.rationale}` : "",
  ].filter(Boolean).join("\n"));

  return [
    "Before responding, you have pending revisions from earlier in this conversation.",
    "Surface them naturally if they are still relevant. If they do not fit, do not shoehorn them in.",
    "The user will trust you more if you correct yourself cleanly, and less if you perform a correction that no longer matters.",
    "",
    ...lines,
  ].join("\n");
}

export async function finalizePendingRevisions(
  supabase: SupabaseLike,
  apiKey: string,
  revisions: PendingRevision[],
  assistantResponse: string,
): Promise<void> {
  if (revisions.length === 0 || !assistantResponse.trim()) return;

  const addressedIds = await classifyAddressedRevisions(apiKey, revisions, assistantResponse);
  const now = new Date().toISOString();

  for (const revision of revisions) {
    const addressed = addressedIds.has(revision.id);
    const { error } = await supabase
      .from("pending_revisions")
      .update({
        status: addressed ? "applied" : "surfaced",
        surfaced_at: now,
      })
      .eq("id", revision.id);

    if (error) console.warn("[pending-revisions] finalize failed:", error);
  }
}

async function classifyAddressedRevisions(
  apiKey: string,
  revisions: PendingRevision[],
  assistantResponse: string,
): Promise<Set<string>> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic Revision Classifier",
      },
      body: JSON.stringify({
        model: REVISION_CLASSIFIER_MODEL,
        messages: [
          {
            role: "user",
            content: `Decide which pending revisions Luca actually addressed in the assistant response.

Pending revisions:
${revisions.map((revision) => `- id=${revision.id}\n  Earlier: ${revision.what_was_said}\n  Revision: ${revision.what_to_say_now}`).join("\n")}

Assistant response:
${assistantResponse}

Return strict JSON only: {"addressed_ids":["id"]}.`,
          },
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return new Set();
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
    const ids = Array.isArray(parsed.addressed_ids) ? parsed.addressed_ids : [];
    return new Set(ids.filter((id: unknown): id is string => typeof id === "string"));
  } catch (e) {
    console.warn("[pending-revisions] classifier failed:", e);
    return new Set();
  }
}
