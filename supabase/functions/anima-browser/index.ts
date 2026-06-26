import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

const MAX_SESSION_SECONDS = 600;
const MAX_ACTIONS = 50;
const DEFAULT_WAIT_MS = 2_500;
const MAX_WAIT_MS = 10_000;

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const body = await req.json().catch(() => ({}));
    const userId = await resolveUserId(supabaseUrl, anonKey, serviceKey, authHeader, body.user_id);
    if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const apiKey = Deno.env.get("BROWSERBASE_API_KEY");
    if (!apiKey) return json({ error: "BROWSERBASE_API_KEY is not configured" }, 200, corsHeaders);

    const goal = String(body.goal || "").slice(0, 800);
    const startingUrl = String(body.starting_url || "");
    const maxSteps = Math.min(Math.max(Number(body.max_steps || 10), 1), MAX_ACTIONS);
    const waitMs = Math.min(Math.max(Number(body.wait_ms || DEFAULT_WAIT_MS), 500), MAX_WAIT_MS);
    if (!goal || !isHttpUrl(startingUrl)) {
      return json({ error: "goal and a valid starting_url are required" }, 400, corsHeaders);
    }

    const projectId = Deno.env.get("BROWSERBASE_PROJECT_ID") || undefined;
    const sessionResponse = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": apiKey,
      },
      body: JSON.stringify({
        ...(projectId ? { projectId } : {}),
        timeout: MAX_SESSION_SECONDS,
        keepAlive: false,
        userMetadata: { user_id: userId, goal: goal.slice(0, 120) },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!sessionResponse.ok) {
      return json({ error: "Browser session could not start", detail: await sessionResponse.text() }, 200, corsHeaders);
    }

    const session = await sessionResponse.json();
    const actions: Array<{ status: string; text: string }> = [
      { status: "success", text: `Started Browserbase session ${session.id}` },
    ];

    let page: Partial<BrowserPageInspection> = {};
    try {
      page = await inspectPage(session.connectUrl, startingUrl, waitMs);
      actions.push({ status: "success", text: `Opened ${page.url || startingUrl}` });
    } catch (err) {
      actions.push({ status: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      await releaseSession(apiKey, session.id, projectId).catch(() => {});
    }

    return json({
      ok: true,
      session_id: session.id,
      status: page.text ? "done" : "errored",
      goal,
      starting_url: startingUrl,
      max_steps: maxSteps,
      wait_ms: waitMs,
      engine: "browserbase",
      synthesis: false,
      capabilities: ["render_js", "inspect_dom_text", "extract_links", "extract_forms"],
      limits: { session_seconds: MAX_SESSION_SECONDS, max_actions: MAX_ACTIONS, compute_budget_usd: 0.5 },
      actions,
      page,
    }, 200, corsHeaders);
  } catch (err) {
    console.error("anima-browser error:", err);
    return json({ error: "Internal error" }, 500, getCorsHeaders(req));
  }
});

interface BrowserPageInspection {
  url: string;
  title: string;
  text: string;
  headings: Array<{ level: number; text: string }>;
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  forms: Array<{ action: string; method: string; fields: Array<{ name: string; type: string; label: string }> }>;
}

async function inspectPage(connectUrl: string, startingUrl: string, waitMs: number): Promise<BrowserPageInspection> {
  const cdp = await connectCdp(connectUrl);
  try {
    const target = await cdp.send("Target.createTarget", { url: startingUrl });
    const targetId = target.targetId;
    const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await delay(waitMs);
    const evaluated = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
        const visibleText = (el) => clean(el && (el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title")));
        const labelFor = (input) => {
          const id = input.getAttribute("id");
          if (id) {
            const label = Array.from(document.querySelectorAll("label")).find((candidate) => candidate.getAttribute("for") === id);
            if (label) return visibleText(label);
          }
          const wrapping = input.closest("label");
          return wrapping ? visibleText(wrapping) : "";
        };
        return {
          url: location.href,
          title: document.title,
          text: document.body ? document.body.innerText.slice(0, 8000) : "",
          headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).slice(0, 40).map((el) => ({
            level: Number(el.tagName.slice(1)),
            text: visibleText(el).slice(0, 240),
          })).filter((h) => h.text),
          links: Array.from(document.querySelectorAll("a[href]")).slice(0, 80).map((el) => ({
            text: visibleText(el).slice(0, 240),
            href: el.href,
          })).filter((link) => link.href),
          buttons: Array.from(document.querySelectorAll("button,[role=button],input[type=button],input[type=submit]"))
            .slice(0, 60)
            .map((el) => visibleText(el) || clean(el.value))
            .filter(Boolean)
            .map((text) => text.slice(0, 160)),
          forms: Array.from(document.querySelectorAll("form")).slice(0, 20).map((form) => ({
            action: form.action || location.href,
            method: (form.method || "get").toLowerCase(),
            fields: Array.from(form.querySelectorAll("input, textarea, select")).slice(0, 40).map((input) => ({
              name: input.getAttribute("name") || input.getAttribute("id") || "",
              type: input.getAttribute("type") || input.tagName.toLowerCase(),
              label: labelFor(input).slice(0, 160),
            })),
          })),
        };
      })()`,
      returnByValue: true,
    }, sessionId);
    return evaluated.result?.value || { url: startingUrl, title: "", text: "", headings: [], links: [], buttons: [], forms: [] };
  } finally {
    cdp.close();
  }
}

function connectCdp(url: string): Promise<{
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<any>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (reason?: unknown) => void }>();
    const openTimeout = setTimeout(() => reject(new Error("Browser CDP connection timed out")), 10_000);

    ws.onopen = () => {
      clearTimeout(openTimeout);
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          return new Promise((res, rej) => {
            const timeout = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`CDP command timed out: ${method}`));
            }, 10_000);
            pending.set(id, {
              resolve(value) {
                clearTimeout(timeout);
                res(value);
              },
              reject(reason) {
                clearTimeout(timeout);
                rej(reason);
              },
            });
          });
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id)!;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message || "CDP error"));
      else entry.resolve(message.result);
    };
    ws.onerror = () => reject(new Error("Browser CDP connection failed"));
  });
}

async function releaseSession(apiKey: string, sessionId: string, projectId?: string) {
  await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BB-API-Key": apiKey },
    body: JSON.stringify({ status: "REQUEST_RELEASE", ...(projectId ? { projectId } : {}) }),
    signal: AbortSignal.timeout(20000),
  });
}

async function resolveUserId(
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  authHeader: string,
  bodyUserId?: string,
): Promise<string | null> {
  const token = authHeader.replace("Bearer ", "");
  if (token && token === serviceKey) return typeof bodyUserId === "string" ? bodyUserId : null;
  if (!authHeader.startsWith("Bearer ")) return null;
  const supabaseAuth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user?.id || null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
