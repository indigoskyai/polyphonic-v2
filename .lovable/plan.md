## Production Readiness Audit — Polyphonic

### What this app is

Polyphonic is a multi-agent AI companion ("a living mind, not a chatbot") with two primary agents (**Luca** orchestrator, **Observer/Guardian** meta-agent), a sophisticated **Mnemos** memory system (engrams, connections, beliefs, decay, consolidation, dialectic, dreaming), background cognition loops (pulse, heartbeat, initiate, reflect, observe), a journal, ChatGPT import, sub-agent dispatch, scheduled tasks, canvas artifacts, checkpoints, computer-use/browser tools, group voice sessions, and a profile/identity stack. Backend = Supabase (Lovable Cloud) + ~55 edge functions + pg_cron-driven loops. AI routing through OpenRouter using user-supplied keys.

### Audit philosophy

Three concurrent passes, each with its own discipline:

1. **Functional** — does every feature actually work end-to-end against real data, on a fresh account, and on an account with thousands of rows?
2. **Hardening** — security (RLS, auth, secrets, key handling), reliability (error boundaries, retries, idempotency), performance (queries, realtime, render), observability (logs, metrics).
3. **Polish** — visual consistency, motion quality, empty/error/loading states, keyboard + a11y, responsive, copy.

### Deliverable

A single self-tracking master document `PRODUCTION_AUDIT.md` at repo root, structured as a granular checklist organized by phase. Each item: id, surface/file, what to verify, how to verify, fix-in-place criteria, status checkbox. Updated after every commit so any session can resume mid-audit. A short companion `PRODUCTION_LAUNCH_CHECKLIST.md` summarizes go/no-go gates.

---

### Plan structure (what goes in PRODUCTION_AUDIT.md)

```text
PRODUCTION_AUDIT.md
├── 0  Operating protocol (how to use this doc, status legend, stop conditions)
├── 1  Inventory & baseline (one-time discovery; outputs feed phases 2–10)
├── 2  Security hardening
├── 3  Backend reliability (edge functions + DB)
├── 4  Data integrity & migrations
├── 5  Auth & onboarding flows
├── 6  Core surfaces functional sweep
├── 7  Memory system (Mnemos) end-to-end
├── 8  Multi-agent + background cognition
├── 9  Performance & scale
├── 10 Observability & error handling
├── 11 Accessibility & responsive
├── 12 Visual polish & copy
├── 13 Production launch gates
└── 14 Decision log + open questions
```

### Phase 0 — Operating protocol
Defines status legend (`[ ] [~] [x] [B] [!]`), commit discipline (one commit per sub-section, `audit/<area>: <imperative>`), stop conditions, and the rule to update this doc after every commit so progress survives session resets. Mirrors the autonomous-loop conventions already in `CLAUDE.md`.

### Phase 1 — Inventory & baseline (one session)
- 1.1 Generate route map (every `<Route>`, every drawer, every modal)
- 1.2 Generate edge function map (each function: invoked-from, auth posture, secrets used, idempotency, schema)
- 1.3 Generate table+RLS map via `supabase--read_query` against `information_schema` + `pg_policies`
- 1.4 Generate cron + pg_net map (every scheduled job, frequency, target function, last 24h success rate via analytics)
- 1.5 Generate store dependency graph (which Zustand store reads which table)
- 1.6 Capture baseline lighthouse + bundle size + cold-load metrics
- 1.7 Snapshot console-error baseline per route (must reach zero new errors by end)

### Phase 2 — Security hardening
- 2.1 Run `security--run_security_scan` and `supabase--linter`; triage every finding
- 2.2 Verify RLS enabled on **every** public table; no `USING (true)` policies on sensitive tables
- 2.3 Audit `user_roles` pattern (already correct per memory) — ensure no role checks against profiles
- 2.4 API key handling: confirm `save_user_api_key` / `decrypt_user_api_key` paths never log plaintext; key never returned to client
- 2.5 Edge function input validation: every function validates body shape (Zod or equivalent), returns 400 on bad input, never echoes secrets in error messages
- 2.6 CORS allowlist review (`_shared/cors.ts`) — production domain only, no `*`
- 2.7 `verify_jwt = false` audit — every such function MUST validate JWT in code or be intentionally public; document each
- 2.8 Service-role key only used in edge functions, never shipped to client
- 2.9 Storage bucket policies (`chat-attachments`, `generated-images`, `workspace-files`) — owner-scoped read/write only
- 2.10 Auth: leaked-password protection (HIBP) ON; email confirmation ON; password reset page exists; session refresh works
- 2.11 Rate limiting: any unauthenticated or expensive endpoint (chat, image gen, web search) needs per-user rate caps
- 2.12 Update `security-memory` document with intentional public surfaces

### Phase 3 — Backend reliability (edge functions + DB)
For each of the ~55 edge functions, a row in a sub-checklist verifying:
- 3.x.a Has CORS preflight handler
- 3.x.b Returns CORS headers on **all** responses including errors
- 3.x.c Catches and logs unhandled errors (no silent 500s)
- 3.x.d Idempotent where it must be (memory-extract, scheduled-task-run, mnemos-consolidate, import-chatgpt)
- 3.x.e Handles missing OpenRouter key gracefully (user-facing message, not 500)
- 3.x.f Streaming functions handle client disconnect without leaking work
- 3.x.g Cron-invoked functions tolerate concurrent runs (advisory locks where state-mutating)
- 3.x.h Logged via `supabase--edge_function_logs` for any 5xx in last 7 days

DB-side:
- 3.51 All `SECURITY DEFINER` functions have `set search_path = public` (already mostly true; verify)
- 3.52 No `CHECK` constraints using non-immutable expressions (per project rule)
- 3.53 `invoke_edge_function` is the single pg_net gateway; no scattered `net.http_post` calls
- 3.54 `app_config` table has restrictive RLS; service role only

### Phase 4 — Data integrity & migrations
- 4.1 Foreign-key audit: cascade deletes on user-owned tables; no dangling references on user delete
- 4.2 Indexes for every realtime / hot-path query (engrams.user_id+created_at, connections.user_id+source_id, messages.thread_id+created_at, etc.); add missing
- 4.3 `REPLICA IDENTITY FULL` only where realtime needs old-row data (engrams, connections, messages, threads); audit and trim others
- 4.4 Soft-delete consistency (`is_deleted` flag handling identical across selects)
- 4.5 Timestamp triggers (`update_updated_at_column`) attached wherever `updated_at` exists
- 4.6 Test cascade-on-user-delete in a scratch account
- 4.7 Backup posture: confirm Lovable Cloud point-in-time recovery is on; document RPO/RTO

### Phase 5 — Auth & onboarding flows
- 5.1 Signup with email — confirmation email actually sent, profile + agents + settings + memory_settings rows auto-created (4 triggers exist; verify all fire)
- 5.2 Signup with Google OAuth — same profile creation
- 5.3 Login + session persistence + tab refresh + token rotation
- 5.4 Forgot password → `/reset-password` page exists and works
- 5.5 Logout clears all stores (audit each Zustand store for stale-after-logout state)
- 5.6 Onboarding flow on a brand-new account → no console errors, every step writes the right row
- 5.7 First-run gate (`FirstRunGate` in `App.tsx`) handles edge cases (auth → fresh account → first message)
- 5.8 OpenRouter key required-state UX: clear messaging if missing, no broken chat

### Phase 6 — Core surfaces functional sweep
For every route, three states (empty / typical / heavy):
- 6.1 `/chat` and `/chat/:threadId` — send, stream, regenerate, error retry, attachments, drag-drop, @mentions, permission cards, agent error cards, code blocks, tables
- 6.2 `/memory` — Memories overview, Engrams (filters/search/sort), Beliefs, Graph (pan/zoom/realtime/filters), Imports, Settings (persistence)
- 6.3 `/mind` — modulators, emotional state, memory pulse, beliefs, inner-life panels (real data, no mocks)
- 6.4 `/journal` — write, list, edit, cron-generated entries
- 6.5 `/profile` + `/profile/identity|skills|revisions|schedule` — read/write/dialectic-driven updates
- 6.6 `/import` — ChatGPT zip upload, progress banner, partial-failure recovery, delete-import
- 6.7 `/checkpoints` — create implicitly, list, diff, restore, compare
- 6.8 `/group` — voice room render, queue, transcript, listening bar
- 6.9 `/workspace` + `/canvas/:artifactId` — artifact creation tool, viewer, persistence
- 6.10 `/settings/*` — every sub-route, sticky save footer dirty-state, agent editor full round-trip
- 6.11 `/_mobile` — phone frame, bottom nav, mobile composer, drawers
- 6.12 Command palette ⌘K — every scope, every quick action wired
- 6.13 All 5 drawers (notifications, thread-detail, observer, memory-detail, activity-timeline) — open/close/ESC/click-outside/focus-trap

### Phase 7 — Mnemos memory system end-to-end
- 7.1 Encode path: `memory-extract` after a chat turn writes engrams + connections; verify in DB
- 7.2 Retrieval: spreading activation returns relevant engrams; surfaced in next prompt
- 7.3 Decay loop (`mnemos-decay` cron) — strength decreases on schedule, respects user `decay_rate`
- 7.4 Consolidation (`mnemos-consolidate`) — respects `dream_frequency` cadence; promotes episodic→semantic; updates beliefs
- 7.5 Dialectic (`mnemos-dialectic`) — generates pending revisions; surfaced in profile
- 7.6 Dreaming narrative — written when OpenRouter key present
- 7.7 Soften loop (`mnemos-soften`) — verify intent and gating
- 7.8 Realtime — new engrams appear in Graph live; new connections animate in
- 7.9 Memory candidates queue — pin/commit/edit/reject all functional; auto-commit-stale runs
- 7.10 Clear-all-memory — wipes engrams/connections/beliefs/cognitive_state/memories cleanly
- 7.11 Mnemos master switch (`mnemos_enabled=false`) — stops every loop without errors

### Phase 8 — Multi-agent + background cognition
- 8.1 Luca chat (`chat-multi`) — parallel reasoning ensemble executes, tools dispatched, observer hooks fire
- 8.2 Observer (`chat-guardian`, `observer-watch`) — produces guardian messages, no infinite loops
- 8.3 Sub-agent dispatch (`subagent-run`, `anima-dispatch`) — async run, report-back message, realtime visualization
- 8.4 Heartbeat / pulse / initiate cron loops — verified running, idempotent, quiet-hour respecting
- 8.5 Scheduled tasks (`scheduled-task-run`) — created via UI, run on schedule, complete or fail visibly
- 8.6 Tool surface (`anima-tool-execute`, web-search, web-read, browser, image-create, workspace-file) — each returns sane data; failures surfaced as agent_error message
- 8.7 Crisis classifier + `crisis-followup` — fires on test phrase, follow-up scheduled
- 8.8 Skills distill + manage — distillation runs after qualifying turns; UI controls work

### Phase 9 — Performance & scale
- 9.1 Seed a test account with 5k engrams + 20k connections + 500 threads; measure
- 9.2 Realtime channel count audit — graph subscription doesn't multiply across remounts
- 9.3 Query limits (1000-row default) — every list view paginates or cursor-loads
- 9.4 Bundle: code-split heavy routes (Canvas, Graph, Mind), lazy-load syntax-highlighter language packs
- 9.5 Graph FPS at 500/1000/2000 nodes; verify Barnes-Hut alpha sleep
- 9.6 Avoid prop-thrash: memoize hot rows (MessageRow, EngramCard, GraphNode tooltip)
- 9.7 Image storage CDN cache headers
- 9.8 Edge function cold-start budget; pre-warm critical functions

### Phase 10 — Observability & error handling
- 10.1 Global React error boundary on `<AppShell>`; per-route boundaries on heavy views
- 10.2 Toast system covers async failures (network, RLS, missing key)
- 10.3 Sentry-equivalent or structured client logging — at minimum, capture `window.onerror` + unhandledrejection to a `client_errors` table
- 10.4 Edge function structured logging (level, function, user_id, request_id) consistent across all 55 functions
- 10.5 Health endpoint or status surface for cron loops (last-success-at per loop, surfaced in `/mind` or settings)
- 10.6 Connection banner reflects realtime channel state accurately

### Phase 11 — Accessibility & responsive
- 11.1 Keyboard nav on every interactive surface; visible `:focus-visible`; ESC closes modals/drawers
- 11.2 Color contrast AA on all text (dark theme — verify body, whisper, eyebrow tokens)
- 11.3 `prefers-reduced-motion` respected by graph, shimmer, drawer, onboarding stagger
- 11.4 Screen-reader labels on all icon-only buttons (Rail, Composer actions, drawer triggers)
- 11.5 Mobile (<768px) breakpoint: every route either has mobile shell or graceful fallback
- 11.6 Tablet (768-1024) breakpoint: drawer/sidebar collapse behavior
- 11.7 Forms have proper `<label>` associations; errors announced via `aria-live`

### Phase 12 — Visual polish & copy
- 12.1 Empty states for every list (no engrams, no threads, no journal entries, no checkpoints, no scheduled tasks, no skills, no imports)
- 12.2 Loading skeletons (not spinners) on first paint of each route
- 12.3 Error states distinct from empty states; offer recovery action
- 12.4 Microcopy pass — eyebrow consistency, sentence-case discipline, no developer jargon
- 12.5 Motion: no jank on route transitions; drawer slide is 60fps; graph idle is silent
- 12.6 Favicon, social-share meta tags, robots.txt, manifest

### Phase 13 — Production launch gates (PRODUCTION_LAUNCH_CHECKLIST.md)
Hard gates — none of these may be `[ ]` at launch:
- Zero new console errors across all routes
- All RLS policies verified; security scan clean or accepted
- All cron loops successful in last 24h
- Auth flows (signup/login/reset/oauth) all green on staging
- Lighthouse Performance ≥ 80, Accessibility ≥ 90 on `/chat` and `/mind`
- Backups verified; recovery rehearsed once
- Custom domain + email domain (if applicable) configured
- Analytics + error reporting wired and receiving events
- Privacy policy + terms pages exist and are linked from auth pages

### Phase 14 — Decision log + open questions
Append-only log mirroring `LUCA_PLAN.md` discipline. Used for any non-obvious choice during the audit (e.g. "Skipped 8.3 sub-agent realtime visualization because table is empty in test account; revisit when subagent-run is invoked").

---

### Execution mode after approval

Once approved, switch to default mode and:
1. Write `PRODUCTION_AUDIT.md` with the full skeleton above (every checkbox stubbed `[ ]`, every sub-task pre-written so future sessions know exactly what to do)
2. Write `PRODUCTION_LAUNCH_CHECKLIST.md` (short version)
3. Execute **Phase 1 — Inventory & baseline** in the same session (it's read-only and feeds everything else)
4. Stop and report: surfaces inventoried, top 5 risks discovered, recommended next phase to tackle

Subsequent sessions pick up wherever the doc says, one phase at a time, committing per sub-section per `CLAUDE.md` discipline.

### Notes / non-goals

- **Not** rewriting features. Audit-only unless a fix is small (<50 lines) and clearly correct.
- **Not** adding new product surfaces. Anything that needs net-new design becomes an Open Question, not a code change.
- Visual polish is constrained to consistency + state coverage — no re-skinning. The Luca aesthetic is the contract.
- Backend schema changes only when an audit finding requires it (missing index, missing RLS, missing trigger). Each gets a Lovable migration prompt logged in the Backend Asks section of the doc.
