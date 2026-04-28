# OpenClaw Integration — Polyphonic as the Only UI

## What we're building

Polyphonic becomes the entire experience. OpenClaw is invisible plumbing that runs on the user's machine. The user never opens an OpenClaw CLI or dashboard. Every Polyphonic agent the user creates — including Luca and Guardian — is an OpenClaw agent under the hood. Conversations stream from the local runtime to Polyphonic in realtime; transcripts sync (encrypted) to Lovable Cloud so the user can read history from any device, but generation always happens on their machine.

A tiny helper CLI (`polyphonic-bridge`) is the install shim today. The same binary becomes the supervisor inside the Electron desktop app later — same protocol, same Supabase tables, no rewrite.

## How it actually works (end-to-end)

```text
   Browser (Polyphonic web app)
            │ supabase realtime + invoke
            ▼
   Lovable Cloud (Supabase)
   ┌──────────────────────────────────┐
   │ openclaw_devices                 │
   │ openclaw_agents (synced spec)    │
   │ openclaw_relay_sessions          │
   │ messages (cloud-synced history)  │
   │ edge fns: openclaw-bridge,       │
   │   openclaw-pair, openclaw-deploy │
   └──────────────────────────────────┘
            ▲ outbound WSS only
            │
   User's machine
   ┌──────────────────────────────────┐
   │ polyphonic-bridge (Node CLI)     │
   │  • supervises OpenClaw Gateway   │
   │  • holds WSS to bridge edge fn   │
   │  • applies agent spec → OpenClaw │
   │  • forwards completions          │
   │ OpenClaw Gateway (127.0.0.1)     │
   │  • runs agents, tools, MCP       │
   │  • OpenAI-compatible endpoints   │
   └──────────────────────────────────┘
```

Key properties:
- **No inbound port on the user's machine.** Bridge dials out over WSS. Works behind NAT, captive portals, etc.
- **Generation = local.** OpenAI/Anthropic/OpenRouter keys live in the bridge config, not in Supabase.
- **History = synced.** Final assistant text + user messages get written to `messages` (already exists), so the existing thread UI just works on a second device.
- **Agent spec = synced.** `openclaw_agents` is the source of truth; the bridge reconciles the local Gateway to match.

## Phased rollout

### Phase 1 — Backend + bridge protocol (no UI yet)
- Migration: new tables `openclaw_devices`, `openclaw_pairing_codes`, `openclaw_agents`, `openclaw_relay_sessions`. RLS = owner-only.
- Add `openclaw_agent_id text` column to `agent_configs` (nullable; non-null means "this Polyphonic agent runs on OpenClaw").
- Edge functions:
  - `openclaw-pair` — issues a 6-digit code + short-lived JWT for a new device.
  - `openclaw-bridge` — WSS endpoint the local bridge dials. Multiplexes per-thread streams.
  - `openclaw-deploy` — pushes an agent spec change to the user's online devices.
- All three follow our existing CORS + zod-validated edge fn pattern.

### Phase 2 — `polyphonic-bridge` CLI (separate npm package, not in this repo)
Tracked here only as a spec — actual code lives in a sibling repo.
- `npx polyphonic-bridge pair` → opens browser to Settings → user clicks "Pair this device" → enters code → bridge stores device JWT in OS keychain.
- `npx polyphonic-bridge start` → installs OpenClaw if missing, supervises it, opens WSS to `openclaw-bridge`, advertises capabilities.
- Reconciles: on every spec change, calls OpenClaw's admin API to upsert the agent (prompt, model, tools, MCP servers).
- For chat: receives `{thread_id, messages}` over WSS, calls local OpenClaw `/v1/chat/completions` with `stream: true`, pipes SSE chunks back over the same WSS frame.

### Phase 3 — Settings UI: Devices + OpenClaw enablement
- New route `/settings/local-runtime`.
- "Install Polyphonic Bridge" panel: copy-paste install command, "Pair this device" button (calls `openclaw-pair`, shows 6-digit code + QR for the desktop app later).
- Devices list: name, OS, last-seen, online dot, "Disconnect" button.
- "Default runtime" toggle per device (where new agents land).

### Phase 4 — Agent editor reworked for OpenClaw
- `AgentDetail.tsx` gains a **Runtime** section: Cloud (current behavior) | Local OpenClaw (new). When Local is picked, the agent is allocated an `openclaw_agent_id` and the spec is synced to all of the user's devices.
- Surfaces native OpenClaw concepts in plain language:
  - **Tools** — pick from the OpenClaw tool catalogue the bridge reports back (filesystem, shell, web, custom).
  - **MCP servers** — paste-or-pick, stored in `openclaw_agents.mcp_servers`.
  - **Channels** — Polyphonic-only for v1. (Telegram/Slack/iMessage stay roadmap; we already have a `mcp_servers` table to lean on.)
- "Test agent locally" button opens a thread bound to that agent on the active device.

### Phase 5 — Chat routing
- `chat-multi/index.ts` already loads the thread's `agent_configs` row. Add a branch: if `agent.openclaw_agent_id` is set, do not call OpenRouter — instead invoke `openclaw-bridge` with `{device_id, agent_id, messages, thread_id}` and proxy its SSE stream back to the client. Existing client code (`Chat.tsx`, streaming UI) needs zero changes.
- If the chosen device is offline: fall back gracefully ("Your local agent is offline — start Polyphonic Bridge to chat") with a retry button.
- Final message persisted to `messages` table as today → cloud sync for free.

### Phase 6 — Luca conversational wizard ("build me an agent that…")
- New tool exposed to Luca: `propose_agent({name, purpose, suggested_prompt, suggested_tools, suggested_mcp_servers, suggested_model})`. Renders inline in chat as a structured proposal card with Edit / Deploy buttons.
- Luca's system prompt gets a wizard mode that activates when the user asks for an agent. It interviews them (purpose → tools → channels → personality → model), then calls `propose_agent`.
- Deploy = insert into `agent_configs` with `openclaw_agent_id` set + `openclaw-deploy` push.
- This reuses our existing tool-execution scaffolding in `chat-multi` + `anima-tool-execute` — no new streaming infrastructure needed.

### Phase 7 — Electron desktop app (later, separate repo)
- Wraps the same web bundle.
- Auto-installs and supervises OpenClaw + bridge in-process.
- Same `openclaw-bridge` WSS protocol, so the cloud side does not change.
- This is the "real turnkey" experience the helper CLI is bridging to.

## Data model (Phase 1 detail)

```text
openclaw_devices
  id uuid pk, user_id uuid, name text, platform text,
  bridge_version text, last_seen_at timestamptz,
  status text ('online'|'offline'|'revoked'),
  created_at timestamptz

openclaw_pairing_codes
  code text pk (6 digits), user_id uuid, expires_at timestamptz,
  consumed_device_id uuid null

openclaw_agents
  id uuid pk, user_id uuid,
  agent_config_id text (fk → agent_configs.id),
  spec jsonb (prompt, model, tools, mcp_servers, params),
  spec_version int, updated_at timestamptz

openclaw_relay_sessions  -- ephemeral, mostly for debugging
  id uuid pk, device_id uuid, opened_at timestamptz,
  closed_at timestamptz null, last_ping_at timestamptz

agent_configs
  + openclaw_agent_id uuid null  -- when set, runtime = local
```

All RLS: `auth.uid() = user_id`, plus service-role full access for the bridge edge fn.

## What stays exactly as-is

- Luca and Guardian today (cloud-routed via OpenRouter) keep working unchanged. Migration to local OpenClaw is opt-in per agent.
- The chat UI, Mnemos memory, Inner Life dashboard, and observer system all continue to operate on the `messages` table — they don't care whether generation happened in the cloud or on the user's laptop.
- Existing OpenRouter key flow is untouched. Local agents use whatever provider keys the user configured in the bridge.

## Honest take on feasibility

This is a real engineering effort but every piece is well-scoped:
- The hardest single thing is the `polyphonic-bridge` CLI — maybe 1–2 weeks of focused work for a solid v1.
- Cloud side (Phases 1, 3, 5) is all stuff this codebase already does well: edge functions, RLS tables, SSE streaming. ~3–5 days.
- Luca wizard (Phase 6) reuses the tool-call infrastructure already running for `anima-tool-execute`. ~2 days.
- The bridge protocol is intentionally identical for CLI and Electron, so the desktop app later is a packaging job, not a redesign.

## Open questions to resolve during build (won't block plan approval)

1. Which provider key surface lives in the bridge config vs. synced from Polyphonic? My recommendation: bridge owns provider keys (true local-first); Polyphonic just picks model IDs.
2. Should encrypted message sync be opt-out per agent? Recommend yes — toggle on the agent editor: "Sync conversation history to my account" defaults on, can be turned off for ultra-sensitive agents.
3. MCP server installation: do we manage MCP server processes ourselves via the bridge, or only register URLs to MCP servers the user already runs? Recommend the latter for v1.

If you approve, I'll start with Phase 1 (tables + the three edge functions) since that unblocks everything else and leaves Luca/Guardian working untouched.