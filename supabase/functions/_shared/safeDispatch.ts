// safeDispatch — fire-and-forget edge function POST that records a cron_health entry
// under "dispatch:<target>" so silent dispatch failures become visible.

import { recordCronFailure, recordCronSuccess } from "./cronHealth.ts";

export interface SafeDispatchOpts {
  target: string;
  authHeader: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}

export function safeDispatch(opts: SafeDispatchOpts): void {
  const { target, authHeader, body } = opts;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const jobName = `dispatch:${target}`;
  const start = Date.now();

  (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${target}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const ms = Date.now() - start;
      if (resp.ok) {
        await recordCronSuccess(jobName, ms);
      } else {
        const txt = await resp.text().catch(() => "");
        await recordCronFailure(jobName, ms, new Error(`${resp.status}: ${txt.slice(0, 200)}`));
      }
    } catch (err) {
      await recordCronFailure(jobName, Date.now() - start, err);
    } finally {
      clearTimeout(t);
    }
  })();
}
