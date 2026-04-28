/**
 * initiate-gate — convenience helper for autonomous edge functions.
 *
 * After producing a notable / important activity_log row, call this to let
 * `luca-initiate` decide whether to escalate via push/email. In-app surfacing
 * already happens via the `surface_to_user` flag on the row itself.
 */

export interface InitiateOptions {
  user_id: string;
  activity_id?: string;
  severity: "info" | "notable" | "important";
  title?: string;
  summary?: string;
}

export async function maybeInitiate(
  supabaseUrl: string,
  serviceRoleKey: string,
  opts: InitiateOptions,
): Promise<void> {
  // 'info' never escalates — skip the round-trip entirely.
  if (opts.severity === "info") return;
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/luca-initiate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(opts),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error(`[initiate-gate] luca-initiate ${resp.status}: ${t.slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[initiate-gate] failed:", err);
  }
}
