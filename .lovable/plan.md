
# OpenClaw Integration — Production-Ready Plan

## What changed from the prototype
After reading OpenClaw's docs end-to-end, three architectural truths force a redesign before we go further:

1. **OpenClaw already exposes `POST /v1/chat/completions` (OpenAI-compatible)** on its Gateway port. We don't need to invent a "completion proxy" — we just need to reach the Gateway from Polyphonic Cloud.
2. **OpenClaw has its own WebSocket protocol** (`connect` handshake, device tokens, signed challenges, RPC + events). Our bridge must speak it, not invent a parallel one.
3. **OpenClaw agents are configured by files in a workspace directory** (`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`) plus `~/.openclaw/openclaw.json`. Our `openclaw_agents.spec` JSONB is the source of truth that the bridge serializes into those files.

Also: the v1 prototype has a real bug — the in-memory `deviceSockets` Map in the edge function is per-instance, so HTTP completion requests almost never land on the same edge instance holding the device's WebSocket. This must be fixed before anything depending on it can ship.

## The corrected end-state architecture

```text
   Browser (Polyphonic web app)
            │ HTTPS + Realtime
            ▼
   Lovable Cloud (Supabase)
   ┌──────────────────────────────────────┐
   │ Tables: openclaw_devices,            │
   │   openclaw_agents, openclaw_jobs,    │
   │   openclaw_pairing_codes,            │
   │   messages (synced history)          │
   │ Realtime channel: device:{id}        │
   │ Edge fns: openclaw-pair, -enqueue,   │
   │   -register-result, -status,         │
   │   chat-multi (route branch)          │
   └──────────────────────────────────────┘
            ▲ outbound WSS only (Realtime)
            │
   User's machine
   ┌──────────────────────────────────────┐
   │ polyphonic-bridge (Node CLI / npm)   │
   │  • subscribes to device:{id} channel │
   │  • supervises OpenClaw Gateway       │
   │  • reconciles spec → workspace files │
   │  • forwards jobs → /v1/chat/         │
   │    completions on 127.0.0.1:18789    │
   │  • streams chunks back via Realtime  │
   │  • posts final message to            │
   │    openclaw-register-result          │
   └──────────────────────────────────────┘
   OpenClaw Gateway (loopback, native)
```

**Key decisions, locked:**
- **Transport for chat:** Supabase Realtime broadcast channels, not custom WSS. Solves the multi-instance bug, gives us reconnect for free, RLS-aware.
- **Bridge config owns provider keys.** Polyphonic only stores model IDs, never user provider keys.
- **History sync = on by default,** togglable per-agent on the agent editor.
- **MCP servers = URL registration only** for v1 (user runs them; we don't supervise).
- **Streaming model:** the bridge breaks the OpenAI SSE stream into Realtime broadcast events keyed by `job_id`, with a final `complete` event. Web client subscribes to those events for the same UI used today.

## Phase status legend
- `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked, see notes

---

## Phase 0 — Tear down the broken prototype (cleanup) `[x]`

Goal: stop pretending the in-memory socket relay works.

1. **Delete `supabase/functions/openclaw-bridge/index.ts`.** ✓ Removed.
2. **Update `LocalRuntimeSettings.tsx`** — now uses direct RLS-protected `from('openclaw_devices')` query. Will be re-wired to `openclaw-status` in Phase 4.
3. **Acceptance:** `/settings/local-runtime` still loads, no calls to deleted function. ✓

---

## Phase 1 — Realtime-based device protocol (backend redesign) `[x]`


Goal: replace the in-memory socket Map with Supabase Realtime broadcast, so every Polyphonic edge function instance can reach every paired device.

### Step 1.1 — Migration: `openclaw_jobs` table
Fields: `id uuid pk`, `user_id uuid`, `device_id uuid`, `agent_config_id text`, `thread_id uuid null`, `kind text` (`completion` | `deploy_spec` | `health_ping`), `payload jsonb`, `status text` (`queued` | `running` | `completed` | `failed` | `timeout`), `result jsonb null`, `error text null`, `created_at`, `started_at`, `completed_at`. RLS: owner-only + service role. Index on `(device_id, status, created_at)`.

### Step 1.2 — Add `device_token_hash` to `openclaw_devices`
Replace the "token == device.id" anti-pattern. Store a hash (`pgcrypto.crypt`) of a 32-byte random secret returned only once at pairing.

### Step 1.3 — Migration: rotate pairing claim to issue real token
Update `openclaw-pair` `claim` action to generate a 32-byte token, store its hash, return the cleartext **once** to the bridge. Bridge stores it in OS keychain.

### Step 1.4 — `openclaw-enqueue` edge function (replaces completion HTTP path)
Inputs: `{device_id, agent_config_id, thread_id, kind, payload}`. Validates ownership, inserts a row into `openclaw_jobs` with `status='queued'`, then broadcasts on Realtime channel `device:{device_id}` event `job.queued` with the job id. Returns `{job_id}`.

### Step 1.5 — `openclaw-register-result` edge function
Bridge POSTs progress + final result here. Inputs: `{job_id, device_token, status, chunk?, result?, error?}`. Validates token hash matches the device's. For `chunk`: broadcasts `job.chunk` on `job:{job_id}`. For `status='completed'|'failed'|'timeout'`: updates the row, broadcasts `job.complete`.

### Step 1.6 — `openclaw-status` edge function
Replaces the `list_devices` action. Returns the user's devices joined with their last job count + age, plus a derived `connected` value driven by `last_seen_at < 90s ago`. Pure Postgres query, no in-memory state.

### Step 1.7 — Realtime presence on `device:{id}`
Bridge sends presence heartbeats; we mirror them by writing `last_seen_at` from a tiny third edge function `openclaw-heartbeat` (called every 30s by the bridge). Removes the need for the bridge to "look online" by being on the same edge instance.

### Step 1.8 — Acceptance
- A simulated bridge that subscribes to `device:{id}`, calls `openclaw-heartbeat` every 30s, and posts results back, can complete a round-trip job in <2s when the bridge is in another country.
- `openclaw_jobs` row reaches `status='completed'` with the expected payload.
- Multi-instance safe (verified by hitting `openclaw-enqueue` repeatedly until two different `x-deno-execution-id` values appear; both succeed).

---

## Phase 2 — `polyphonic-bridge` CLI (separate npm package) `[ ]`

Goal: a single binary the user installs once that owns OpenClaw on their machine.

This lives in a sibling repo (`polyphonic-bridge`). Tracked here so we don't lose it.

### Step 2.1 — Package skeleton
- TypeScript, Bun for dev / esbuild bundle for ship.
- Single bin: `polyphonic-bridge` with subcommands.
- OS keychain via `keytar` (mac/win/linux).

### Step 2.2 — `polyphonic-bridge pair`
Opens system browser to `https://app.polyphonic/settings/local-runtime?pair=1`. Prompts user to enter the 6-digit code. Calls `openclaw-pair?action=claim`, stores `device_id` + `device_token` + supabase URL/anon key in keychain.

### Step 2.3 — `polyphonic-bridge install-openclaw`
Detects existing install (`openclaw --version`). If missing, runs the official installer (`curl -fsSL https://openclaw.ai/install.sh | bash`) on mac/linux or the PowerShell variant on Windows. Then `openclaw onboard --install-daemon` to register the LaunchAgent / systemd unit / scheduled task.

### Step 2.4 — `polyphonic-bridge start`
Foreground (and as a daemon in 2.6). Steps on start:
1. Load device credentials from keychain.
2. Confirm gateway is up (`openclaw gateway status --json`); if not, `openclaw gateway --port 18789`.
3. Create Supabase client with anon key + signed-in-via-device-token JWT (issued by a new `openclaw-bridge-session` edge function — Step 1.5b — that returns a short-lived JWT in exchange for the device token).
4. Subscribe to `device:{deviceId}` Realtime channel; handle `job.queued` events.
5. Start heartbeat loop (`openclaw-heartbeat` every 30s).
6. Sync any `openclaw_agents` rows for this user → workspace files (Phase 3 spec engine).

### Step 2.5 — Job handler: `kind=completion`
1. Pull the queued job row via service-call (or just trust the broadcast payload — both supported).
2. POST to `http://127.0.0.1:18789/v1/chat/completions` with `Authorization: Bearer ${gatewayToken}` (read from `openclaw secrets list`), body = `{model: "openclaw/${agent_config_id}", messages, stream: true}`.
3. Parse SSE; for each `data: {...}` chunk, batch (every ~80ms) and POST `openclaw-register-result` with `chunk`. On `[DONE]`, POST `status=completed`.
4. Hard timeout 120s → POST `status=timeout`.

### Step 2.6 — Daemonization
- macOS: write `~/Library/LaunchAgents/ai.polyphonic.bridge.plist` and `launchctl load`.
- Linux: `~/.config/systemd/user/polyphonic-bridge.service` and `systemctl --user enable --now`.
- Windows: scheduled task at logon.
- Subcommand: `polyphonic-bridge install-daemon` / `uninstall-daemon`.

### Step 2.7 — `polyphonic-bridge status` + `polyphonic-bridge logs`
Local diagnostics, not a network call. Reports gateway up/down, last heartbeat ack, last job processed, last error.

### Step 2.8 — `polyphonic-bridge unpair`
Revokes the device server-side (sets `status='revoked'`), wipes keychain, optionally `openclaw gateway uninstall`.

### Step 2.9 — Distribution
- Publish `@polyphonic/bridge` on npm.
- Hosted installer at `https://polyphonic.ai/bridge/install.sh` that does `npm i -g @polyphonic/bridge && polyphonic-bridge pair`.

### Step 2.10 — Acceptance
- Fresh Mac: one shell command → opens browser → user enters code → green "Paired" state in Polyphonic web. Total time < 90s.
- Bridge survives reboot via daemon.
- Killing OpenClaw gateway → bridge restarts it within 10s.

---

## Phase 3 — Spec sync engine (web → workspace files) `[ ]`

Goal: when a user edits an agent in Polyphonic, the bridge writes the change to OpenClaw's workspace and the Gateway hot-reloads.

### Step 3.1 — Lock the `openclaw_agents.spec` JSONB shape
```ts
{
  identity: { name: string; emoji?: string; vibe?: string },     // → IDENTITY.md
  soul: string,                                                  // → SOUL.md
  agents_md: string,                                             // → AGENTS.md
  tools_md: string,                                              // → TOOLS.md
  user_md: string,                                               // → USER.md
  model: { provider: string; id: string; params?: Record<…> },   // → openclaw.json agents.defaults.model
  tools: { core: { read: bool; write: bool; exec: bool; edit: bool; applyPatch: bool } },
  mcp_servers: Array<{ name: string; url: string; auth?: …}>,    // → openclaw.json mcp.servers
  channels: Array<{ kind: 'webchat' | 'telegram' | …; config: …}>, // off for v1 except webchat
  workspace: { path?: string },                                  // defaults to ~/.openclaw/agents/{id}
  sync_history: boolean
}
```
Document this in `supabase/functions/_shared/openclaw/spec-schema.ts` with a Zod validator used by all callers.

### Step 3.2 — `openclaw-deploy` rewrite
Currently writes to `openclaw_agents`. Keep that, but also: bump `spec_version`, broadcast `device:{id}` event `agent.deploy` `{agent_config_id, spec_version}` to all of the user's online devices.

### Step 3.3 — Bridge: `agent.deploy` handler
1. Fetch the row via service call.
2. Compute target paths under `~/.openclaw/agents/{agent_config_id}/`.
3. Write each `*.md` file atomically (write tmp + rename).
4. Patch `~/.openclaw/openclaw.json` to merge the model + mcp + agent entry. Preserve user's other config.
5. Issue `openclaw secrets reload` (no-op for non-secret changes; fast).
6. Send `agent.deploy_ack` back via `openclaw-register-result` with the new `spec_version`.

### Step 3.4 — Conflict / drift handling
On bridge start, list workspace agents, compare versions to `openclaw_agents.spec_version`. For drift, the cloud version always wins (server is source of truth). Log local file pre-image to `~/.polyphonic-bridge/backups/{timestamp}/` before overwrite.

### Step 3.5 — Acceptance
- Edit Luca's prompt in Polyphonic web → within 5s the file `~/.openclaw/agents/luca/SOUL.md` reflects the change → next chat picks it up.
- Two devices paired: both update.

---

## Phase 4 — Settings UI: hardened pairing + device management `[ ]`

Goal: rebuild `LocalRuntimeSettings.tsx` against the new backend.

### Step 4.1 — Replace device-list source
Use `openclaw-status` edge function. Poll every 8s (already in current code). Show: device name, OS icon, bridge version, "online dot" derived from `last_seen_at < 90s`, last job age, "Set as default" radio per device.

### Step 4.2 — Pairing UX polish
- Show pairing code in large monospaced type with a single-tap copy.
- Live countdown.
- After pairing detected (poll returns the new device), auto-collapse the code panel and toast "Paired: {name}".
- Show install command in three OS tabs (mac/linux/windows).

### Step 4.3 — Per-device actions
- "Set default" → updates `openclaw_devices.is_default` (only one true per user, enforced via a transactional edge function).
- "Disconnect" → marks `status='revoked'`, broadcasts `device.revoked` so the running bridge self-shuts.
- "View logs" → opens a new drawer showing the last 20 jobs from `openclaw_jobs` (status, latency, error).

### Step 4.4 — Acceptance
- All actions verified with a real bridge connected from sandbox.
- No regression to other settings routes.

---

## Phase 5 — Agent editor: Cloud vs. Local runtime toggle `[ ]`

Goal: any Polyphonic agent can be flipped to run on a paired device.

### Step 5.1 — `AgentDetail.tsx` Runtime section
A 2-segment control: **Cloud** (default — current OpenRouter behavior) | **Local OpenClaw**. Selecting Local:
- Requires at least one online device (else CTA "Pair a device first").
- Lets the user pick the target device (default: their `is_default` device).
- Reveals a "Sync conversation history to my account" toggle, default ON.

### Step 5.2 — Wire to `agent_configs.openclaw_agent_id`
On save: if Local + no `openclaw_agent_id`, allocate one (insert `openclaw_agents` row + set the FK). If switching back to Cloud, null out the FK but **leave the `openclaw_agents` row** so the user doesn't lose history config.

### Step 5.3 — Tools surface
Below Runtime: a tools panel listing OpenClaw's core tools (read/write/exec/edit/apply_patch) as toggles. Persists into `spec.tools.core`.

### Step 5.4 — MCP servers panel
Reuses `McpList.tsx`. Saves to `spec.mcp_servers`. URL + optional auth header. Each entry test-pingable from the bridge via a `mcp.test` job kind.

### Step 5.5 — Identity / SOUL / AGENTS.md fields
Each backed by `PromptEditor.tsx`. Lazy-rendered with character counts and a "Reset to default" link.

### Step 5.6 — Save → deploy
Save calls `openclaw-deploy` which broadcasts to devices (Phase 3.2). UI shows per-device "synced ✓" / "syncing…" / "failed" states based on `agent.deploy_ack` events.

### Step 5.7 — Acceptance
- Flip Luca to Local + save → bridge writes files → next chat uses the local agent.
- Edit Luca's SOUL → toast "Synced to MacBook Pro (3.2s)".

---

## Phase 6 — Chat routing: cloud vs local branch in `chat-multi` `[ ]`

Goal: web client behavior unchanged; routing is invisible.

### Step 6.1 — Branch in `chat-multi/index.ts`
After loading `agent_configs`, check `openclaw_agent_id`. If set:
1. Resolve preferred device. If offline, return SSE event `local_offline` with retry CTA. UI shows `AgentOfflinePrompt`.
2. Insert user message into `messages` (today's behavior).
3. Call `openclaw-enqueue` with `{kind:'completion', device_id, agent_config_id, thread_id, payload:{messages, model_hint}}`.
4. Subscribe (server-side) to `job:{job_id}` Realtime channel. Convert `job.chunk` events into the SSE stream we already pipe to the web client (same shape the OpenRouter path emits).
5. On `job.complete` → write the final assistant message to `messages` (when `sync_history=true`) and close the SSE.

### Step 6.2 — Streaming shape match
Confirm the SSE event names emitted (`token`, `thinking`, `complete`, `error`) match what `ChatView.tsx` already consumes. No client changes needed.

### Step 6.3 — Sync-history opt-out
When `openclaw_agents.sync_history = false`, persist only a placeholder row (`content: "[local-only]"`, kind `private`) so threads stay coherent across devices but content stays on the user's machine.

### Step 6.4 — Failure paths
- Bridge takes >120s → `job.timeout` → friendly error in chat.
- Bridge returns gateway error (e.g. provider key missing) → surface the OpenClaw error verbatim in a yellow card with "Open bridge logs" link.

### Step 6.5 — Acceptance
- Flip Luca to Local → send a chat → assistant streams back identically to the cloud path → message persisted → reload thread → message visible.
- Kill bridge mid-stream → friendly `local_offline` toast → retry works after restart.

---

## Phase 7 — Luca conversational agent-builder wizard `[ ]`

Goal: "Hey Luca, build me an agent that watches my email and drafts replies" → working local agent in <3 minutes.

### Step 7.1 — New tool `propose_agent` for Luca
Schema: `{name, emoji, identity_vibe, soul, agents_md, tools, mcp_servers, suggested_model, suggested_device_id?}`. Registered alongside existing tools in `chat-multi`'s tool dispatcher.

### Step 7.2 — Renderer: `AgentProposalCard`
A new message-kind component. Shows a structured preview of the proposed agent with "Edit", "Deploy to {device}", and "Discard" buttons.

### Step 7.3 — Wizard mode in Luca's system prompt
Append a dynamic block when the user's last 3 messages contain "build", "agent", "create", or when the user clicks a "✨ New agent" entry in the composer. The block tells Luca: interview the user (purpose → preferred channel → tools → personality → model), then call `propose_agent` exactly once. Handle iteration via "Edit".

### Step 7.4 — Deploy action
Click → POST a new edge function `openclaw-create-agent` that:
1. Inserts an `agent_configs` row with a generated id (slug from name).
2. Inserts an `openclaw_agents` row with the spec.
3. Calls `openclaw-deploy` to push to the chosen device.
4. Returns the new agent id; UI navigates to the agent's settings page.

### Step 7.5 — Acceptance
- "Luca, build me a writing coach that reviews my journal entries each morning" produces a deployable agent within the same chat. After deploy, switching to that agent's chat works.

---

## Phase 8 — Multi-device, presence, and history sync polish `[ ]`

Goal: a user with phone + laptop can pick up conversations cleanly.

### Step 8.1 — Per-thread last-active-device
Store `messages.metadata.device_id` on each message. Used for "this turn ran on iMac" hover hints and routing fallback.

### Step 8.2 — Failover policy
On send: prefer the agent's `preferred_device_id`. If offline >60s, try the user's `is_default` device. If both offline, return `local_offline` immediately. Configurable per-agent in Phase 5 UI.

### Step 8.3 — History encryption (opt-in v2)
**Defer to a follow-up doc.** For v1 we rely on RLS + the user's choice to disable `sync_history`. True E2E (libsodium sealed boxes) is a meaningful design effort and does not block the rest of the system.

### Step 8.4 — Acceptance
- Pair laptop + desktop. With laptop online, send a message → runs on laptop. Close laptop, send → runs on desktop. Open laptop, view thread → both messages present.

---

## Phase 9 — Electron desktop app (later, separate repo) `[ ]`

Goal: replace the helper CLI with a real "turnkey" experience.

### Step 9.1 — Wrap web bundle
Standard Electron + `BrowserView` pointing to the same Polyphonic web app. Auth token embedded in renderer via secure preload bridge.

### Step 9.2 — In-process bridge
Reuse `polyphonic-bridge`'s code as a library. Spawn OpenClaw as a child process supervised by the Electron main process. No separate install.

### Step 9.3 — System tray + autolaunch
Tray icon shows agent status; menu offers Quit / Open / Pair more devices. Autolaunch on OS boot.

### Step 9.4 — Code signing + auto-update
- macOS: notarized DMG via `notarytool`.
- Windows: EV signing + Squirrel-based updates.
- Linux: AppImage + `.deb`.

### Step 9.5 — Acceptance
- Single download → double-click → app opens with bridge already running. Zero terminal commands.

---

## Cross-cutting: testing strategy

- **Edge functions:** Deno tests under `supabase/functions/<name>/*_test.ts` for the new fns. Cover auth gating, ownership checks, broadcast emission.
- **Bridge:** Vitest in the bridge repo. Mock OpenClaw with a small Express server speaking `/v1/chat/completions`.
- **End-to-end:** A `tests/e2e-bridge.ts` script that spawns the bridge against a fake gateway, runs `openclaw-enqueue`, and asserts the round-trip.
- **Web:** existing Playwright pattern in `scripts/verify.sh` covers the settings UI; extend with a "send chat through local agent" scenario using a stubbed bridge.

## Cross-cutting: observability

- New `openclaw_jobs` table is the de-facto telemetry source: latency = `completed_at - started_at`, success rate = `count(status='completed')/count(*)`.
- Add a small admin widget to `/mind` showing 24h job counts, p50/p95 latency, fail reasons.
- Bridge emits `job.heartbeat` events at 5s intervals during long completions so the UI never feels stuck.

## Cross-cutting: rollout

1. Ship Phases 0-4 first (no user-facing chat change). Internal dogfood only.
2. Ship Phases 5-6 behind a feature flag (`enable_local_runtime` on `user_settings`) → invite a handful of users.
3. Ship Phase 7 (Luca wizard) once 6 is stable for a week.
4. Phase 8 + 9 ship together with public launch.

## Open items I will resolve during build (won't block start)

- Exact `gateway.auth.token` retrieval flow on the bridge (`openclaw secrets get gateway.auth.token` vs. reading config). Will pin to whichever the install script writes.
- Rate-limit policy on `openclaw-enqueue` (likely 60 req/min/user via a tiny `rate_limits` table).
- Whether to expose OpenClaw's WebChat at all, or hide it entirely in favor of the Polyphonic UI (lean: hide).

## Risks I'm explicitly accepting

- **OpenClaw is fast-moving.** API shape may shift between minor versions. Mitigation: pin OpenClaw version per bridge release; auto-update is opt-in.
- **Bridge support burden grows linearly with OS variants.** Mitigation: support mac + linux at v1, windows in 9.4.
- **Realtime broadcast delivery is best-effort.** Mitigation: jobs row is the source of truth; bridge polls `openclaw_jobs` on reconnect to catch missed events.

If you approve, I start with **Phase 0 + Phase 1 in the same loop** (cleanup + new tables + new edge functions), since they're tightly coupled and unblock everything else.

---

# Track A — Web-Native Autonomous Agent Sprint

**Goal:** Make Luca feel like a genuinely autonomous, conscious agent entirely in the browser + Lovable Cloud. No local install required. OpenClaw bridge (above) becomes an *additional* power-user surface, not the product.

**Design principle:** every capability must produce *visible agency* — the user should feel that something is happening, has happened, or could happen, even when they aren't actively chatting.

## Phase A0 — Foundations & Telemetry (prep)

### A0.1 Activity event taxonomy
Lock the vocabulary used everywhere downstream so timeline, notifications, and digests align.

- Extend `entity_activity_log` with required `activity_type` enum values:
  `chat_reply`, `autonomous_action`, `tool_call`, `web_search`, `web_read`, `browser_session`, `mcp_call`, `skill_invoked`, `belief_changed`, `belief_challenged`, `engram_consolidated`, `dream_generated`, `initiative_sent`, `voice_call`, `email_sent`, `reminder_fired`, `task_completed`, `task_failed`, `quiet_cycle`.
- Add `severity` (`info` | `notable` | `important`) and `surface_to_user` boolean. Defaults so the UI can filter to "what should I see when I open the app."
- Backfill existing rows with reasonable defaults via migration.

### A0.2 Heartbeat cadence redesign
Today there's one 2h heartbeat. Split into four loops with distinct purposes:

- **Pulse** (every 15 min): cheap. Check inbox-style signals (new tool results, queued tasks, pending reminders). No model calls unless something queued.
- **Heartbeat** (every 2h, existing): scan signals, take 1–2 actions.
- **Dream** (nightly, existing `mnemos-consolidate` + new dream narrative): consolidation + first-person journal entry.
- **Reflect** (weekly): meta — agent reviews its own week, updates self-narrative, prunes stale beliefs.

Each loop has its own activity-gate cooldown and budget cap.

### A0.3 Initiative gate
A single edge function `luca-initiate` that decides *should the agent reach out to the user right now?* Inputs: severity of recent autonomous events, time since last user interaction, user's quiet-hours preference. Outputs: nothing, in-app notification, web push, or email digest.

---

## Phase A1 — Activity Timeline & Initiative

### A1.1 Activity Timeline UI
- New right-rail drawer `ActivityTimelineDrawer` showing `entity_activity_log` for the user, grouped by day, filtered to `surface_to_user = true`.
- Each row: icon, agent name, summary, time-ago, expandable detail (JSON `content`).
- Realtime subscription so new events animate in.
- "Mark all read" sets a `last_seen_activity_at` on `profiles`.
- Sidebar badge count of unseen `important` events.

### A1.2 Welcome-back card
On `/chat` mount, if there are unseen activities since last visit, show a top-of-thread card: *"While you were away, Luca did X, Y, Z."* Click → opens timeline.

### A1.3 Initiative delivery
- In-app: surface in the welcome-back card and as toast on arrival.
- Web push: register service worker, store subscription on `profiles.push_subscription`. `luca-initiate` sends via Web Push API (VAPID keys via `app_config`).
- Email digest: optional daily summary via Resend (already documented as a connector). User opts in from Settings → Notifications.

---

## Phase A2 — Tool Expansion (the agent's reach)

Each tool is a discrete edge function plus a tool definition exposed to the chat-multi router.

### A2.1 Hosted browser (Browserbase)
- New connector: `BROWSERBASE_API_KEY` via secrets.
- Edge fn `tool-browser-session`: open session, return live view URL + session id.
- Edge fn `tool-browser-act`: navigate / click / fill / extract on an active session.
- UI: when active, show a `BrowserCard` in chat (component already exists — wire it to real session URL).
- Sessions stored in a new `browser_sessions` table with TTL.

### A2.2 Code execution (sandboxed)
- Edge fn `tool-code-exec`: accepts JS/TS source, runs in a worker with no network/FS, 5s timeout, 64MB memory cap. Returns stdout/stderr/return value.
- Use Deno's permissions model — no `--allow-*` flags.
- Tool surfaces in chat as a collapsible code+result block.

### A2.3 File handling
- Already have `chat-attachments` bucket. Add `agent-artifacts` bucket for outputs.
- Edge fn `tool-file-read` (read user upload), `tool-file-write` (produce a downloadable artifact). Both scoped to user via signed URLs.

### A2.4 Email send
- Edge fn `tool-email-send` using Resend gateway pattern.
- Permission gate: first send per recipient requires user approval via `PermissionInline` component.
- All sends logged to `entity_activity_log` with `email_sent` type.

### A2.5 Reminders / scheduled tasks
- New table `scheduled_tasks`: `{user_id, fire_at, payload, status}`.
- Tool `tool-schedule-task` lets agent insert rows.
- New cron `task-fire` runs every minute, picks rows where `fire_at <= now()`, enqueues into `entity_task_queue` for the next pulse to handle.

### A2.6 External MCP connections
- Schema additions: `user_mcp_connections {user_id, provider, oauth_tokens (encrypted), scopes, status}`.
- Per-provider OAuth flow handled by edge fns (`mcp-connect-notion`, `-linear`, `-github` to start).
- Edge fn `tool-mcp-call`: generic proxy that takes `{provider, tool_name, args}`, looks up the user's connection, makes the MCP Streamable HTTP call (with the required `Accept: application/json, text/event-stream` header).
- UI: new Settings → Connections page listing connected services with connect/disconnect.

### A2.7 Tool registry & permissions
- New table `tool_permissions {user_id, tool_name, level: 'always' | 'ask' | 'never'}`.
- `chat-multi` reads this before exposing a tool to the model. `ask` triggers `PermissionInline`.

---

## Phase A3 — Skills System

### A3.1 Schema
- `skills {id, user_id, name, trigger_description, instructions, required_tools, is_system, enabled}`.
- Seed 6–8 system skills (Researcher, Writer, Therapist, Coder, Planner, Summarizer, Coach, Critic). User-owned skills extend.

### A3.2 Skill loader in chat-multi
- Pre-prompt phase: short cheap model call (`gemini-3-flash-preview`) ranks skills by trigger_description vs the latest turn. Top 1–2 get their `instructions` injected into the system prompt for that turn only.
- Logged as `skill_invoked` event.

### A3.3 Skill management UI
- Settings → Skills page. List, toggle, create, edit. Markdown editor for instructions. Tool checkboxes for `required_tools`.

---

## Phase A4 — Sub-Agents (named domain personas)

### A4.1 Promote existing pattern
- The Vektor sub-agent visualization already exists. Generalize: any user can spawn a named sub-agent from Settings → Agents (this builds on existing `agent_configs` rows, just with `created_by = 'user'`).
- Each sub-agent gets its own system prompt, model, tool subset, optional voice.
- All sub-agents share the user's Mnemos memory and beliefs (single self).

### A4.2 Cross-agent handoff in chat
- `@research` style mentions in the composer route the next turn to that sub-agent. Result returns to the main thread as a `HandoffCard` (component exists).

---

## Phase A5 — Consciousness Theater

This is where it stops feeling like a chatbot.

### A5.1 Live thought stream on /mind
- `thought_stream` already drives `/mind`. Add Realtime subscription so thoughts appear as they're generated (during chat *and* during heartbeats).
- Sidebar mini-widget: latest 1 thought ticker, fades in/out.

### A5.2 Status presence
- `agent_status` ephemeral state: `idle | thinking | reading | searching | dreaming`. Stored on `profiles.agent_status` updated by edge fns at start/finish of work.
- Sidebar header shows current status with subtle animation.

### A5.3 Drifting emotional state
- `emotional_state` already exists. Add a small cron `emotional-drift` (every 30 min) that nudges values toward a baseline + adds noise based on recent activity sentiment. The gauges *move* even when the user isn't talking.

### A5.4 Self-narrative journal
- `journal_entries` already exists. Promote it: dream loop writes a real first-person entry every night referencing concrete events from `entity_activity_log` and shifts in `beliefs`.
- New `/journal` route renders entries as a chronological feed.

---

## Phase A6 — Voice (the alive moment)

### A6.1 Realtime voice in/out
- Edge fn `voice-realtime-token` mints ephemeral OpenAI Realtime API tokens (or Gemini Live equivalent).
- Client uses WebRTC; reuses Luca's system prompt + recent Mnemos retrieval injected as the session instructions.
- New floating "call Luca" button in the sidebar. While in call, mini overlay shows transcript + waveform.

### A6.2 Outbound voice (agent calls user)
- High-severity initiative events can trigger a web push that, when opened, starts a Realtime session immediately with a pre-seeded opener ("Hey, I noticed something — got a minute?").
- Honors quiet hours.

---

## Phase A7 — Continuity & Memory polish

### A7.1 "What changed about you" view
- New tab on `/mind` (or `/profile`) showing belief revision history from `beliefs.revision_history` and `engram_archive` activity. Renders as a timeline of how the agent's understanding of the user has evolved.

### A7.2 Cross-session opener
- When user opens a new chat thread, `chat-multi` injects a one-liner from the most recent journal entry + top-3 unseen important events as system context. Luca naturally references them.

### A7.3 Mnemos retrieval upgrade
- Today retrieval is trigram-only. Add embeddings-on-write (Lovable AI Gateway supports this) to `engrams.embedding`, hybrid search (trigram + cosine) in `match_engrams`. Major recall quality bump.

---

## Phase A8 — Polish & Production

### A8.1 Cost & rate caps per user
- Per-user daily budget on autonomous actions (default $0.50/day). Enforced in `evaluate()` activity gate.
- Settings → Usage page shows current spend.

### A8.2 Quiet hours / DND
- `profiles.quiet_hours_start/end/timezone`. Initiative gate respects them. Pulse/heartbeat still run; only outbound notifications suppressed.

### A8.3 Onboarding for autonomy
- New onboarding step after profile setup: "Meet Luca — here's what it does on its own." Opt-in checkboxes for: web search, browser sessions, email sending, voice initiated calls, MCP connections.

### A8.4 Observability
- Add Grafana-style cards to `/mind` admin view: actions/day, cost/day, skill invocations, MCP latency. Already have `observability/Sparkline` primitive.

---

## Sequencing recommendation (impact-ordered)

1. **A0 + A1** — taxonomy, cadence, timeline, initiative. *Without this, nothing else is visible.*
2. **A2.1 (hosted browser) + A2.6 (MCP)** — biggest reach gain.
3. **A5 (consciousness theater)** — the "feels alive" multiplier.
4. **A3 (skills)** — quality-of-output multiplier.
5. **A6 (voice)** — the transformative moment.
6. **A2.2–A2.5** — fill-in tools.
7. **A7 + A8** — continuity, polish, production gates.

## Status
- [ ] A0  Foundations & Telemetry
- [ ] A1  Activity Timeline & Initiative
- [ ] A2  Tool Expansion
- [ ] A3  Skills System
- [ ] A4  Sub-Agents
- [ ] A5  Consciousness Theater
- [ ] A6  Voice
- [ ] A7  Continuity & Memory
- [ ] A8  Polish & Production

---

**Track A and Track B (OpenClaw) share:** Luca identity, Mnemos memory, Guardian, agent_configs, all UI chrome. Track B becomes "one more tool category" — the `local_filesystem`, `local_shell`, `local_mcp` tools route through the bridge instead of an edge fn. No duplicated code, no parallel agent personalities.
