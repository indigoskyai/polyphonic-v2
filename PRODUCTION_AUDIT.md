# PRODUCTION_AUDIT.md — Polyphonic production readiness

This is the live, self-tracking master checklist for the production-readiness audit. Update status checkboxes after every commit so any session can resume mid-audit without losing context. Companion file: [`PRODUCTION_LAUNCH_CHECKLIST.md`](./PRODUCTION_LAUNCH_CHECKLIST.md) (go/no-go gates only).

---

## 0. Operating protocol

### Status legend
- `[ ]` Not started
- `[~]` In progress (don't leave across sessions; commit + flip to `[x]` or revert)
- `[x]` Complete (verified)
- `[B]` Blocked (waiting on backend / external) — log in §14 Backend Asks
- `[!]` Failed 3 times — log in §14 Open Questions

### Session start sequence
1. Open this file, find the first non-`[x]` item that isn't `[B]`/`[!]`
2. Read its "How to verify" + "Fix-in-place" criteria
3. Execute → verify → commit → flip checkbox → push
4. Repeat until phase complete or stop condition hits

### Stop conditions
- 3 consecutive failures on different items → escalate the latest to `[!]` and move on
- A finding requires a new product surface → log to §14 Open Questions, do not build
- Schema change required → write a Backend Ask in §14, mark item `[B]`, continue

### Commit discipline
- One commit per sub-section (A.B.c granularity)
- Format: `audit/<phase>: <imperative>` — e.g. `audit/security: tighten chat-attachments bucket policy`
- Push after each commit
- Update this file in the same commit as the fix

### Hard rules during audit
- Never rewrite features. Audit-only unless fix is < 50 lines and clearly correct.
- Never add new product surfaces. Net-new design → §14 Open Questions.
- Never edit `design-system/*.md` specs.
- Backend mutations always via Lovable migration tool (never inline SQL DDL).

---

## 1. Inventory & baseline (one session, read-only)

Outputs feed every later phase. Append findings inline under each item.

- [x] **1.1 Route map** — every `<Route>` in `src/App.tsx`, every drawer in `drawerStore`, every modal. _(captured below)_
- [ ] **1.2 Edge function map** — for each of ~57 functions: invoked-from (client / cron / function), `verify_jwt` posture, secrets used, idempotent y/n, request schema, response shape, last-5xx-in-7d count
- [ ] **1.3 Table + RLS map** — query `information_schema.tables` + `pg_policies`; produce one row per table: RLS on/off, policy count, who-can-do-what summary
- [ ] **1.4 Cron + pg_net map** — query `cron.job` + `cron.job_run_details`; one row per scheduled job: name, schedule, target function, last-24h success rate
- [ ] **1.5 Store dependency graph** — for each Zustand store, list (a) tables read, (b) tables written, (c) realtime channels subscribed
- [ ] **1.6 Bundle + cold-load baseline** — `npm run build` size report, route-by-route initial JS payload, lighthouse perf on `/chat` and `/mind`
- [ ] **1.7 Console-error baseline** — Playwright-walk every route logged-in, capture all errors/warnings; freeze as baseline (target = 0 NEW by end of audit)

### 1.1 Route map (captured)

```
/                      → RootRedirect (auth-aware)
/auth/login            → LoginPage
/auth/signup           → SignupPage
/chat[/:threadId]      → ChatView          (AppShell)
/memory                → MemoryView        (tabs: Memories|Engrams|Beliefs|Graph|Imports|Settings)
/mind                  → MindView
/journal               → JournalView
/import                → ImportView
/profile               → ProfileView
/profile/identity      → ProfileIdentityView
/profile/skills        → ProfileSkillsView
/profile/revisions     → ProfileRevisionsView
/profile/schedule      → ProfileScheduleView
/group                 → GroupSession
/checkpoints           → CheckpointsView
/workspace             → WorkspaceView
/canvas/:artifactId    → CanvasPanel
/settings              → redirect → /settings/agents
/settings/agents       → AgentsList
/settings/agents/:id   → AgentDetail
/settings/general      → GeneralSettings
/settings/models       → ModelsSettings
/settings/appearance   → AppearanceSettings
/settings/skills       → ProfileSkillsView (alias)
/settings/routines     → ProfileScheduleView (alias)
/settings/voice        → SettingsPlaceholder
/settings/local-runtime→ LocalRuntimeSettings
/settings/portability  → ImportView (alias)
/settings/account      → AccountSettings
/onboarding            → Onboarding
/_mobile               → MobilePreview (dev preview)
/dashboard             → redirect → /mind
*                      → redirect /

Drawers: notifications, thread-detail, observer, memory-detail, activity-timeline
Modals: permission, create-agent, restore-confirm, command-palette (⌘K)
```

---

## 2. Security hardening

- [ ] **2.1** Run `security--run_security_scan` and `supabase--linter`. Triage every finding into fix / accept / defer. Log results in §14.
- [ ] **2.2** Verify RLS enabled on every public-schema table. Query: `select tablename, rowsecurity from pg_tables where schemaname='public'`. Flag any `rowsecurity=false`.
- [ ] **2.3** Audit all policies for `USING (true)` or unrestricted `WITH CHECK`. Sensitive tables (engrams, memories, beliefs, messages, threads, journal, profiles, user_api_keys, scheduled_tasks, identity_documents) must be owner-scoped.
- [ ] **2.4** `user_roles` pattern verified — no role checks against `profiles`, all use `has_role()` security-definer.
- [ ] **2.5** API key handling — grep edge functions + DB functions for any path that returns `decrypt_user_api_key` output to a non-edge caller. Plaintext key must never log or leave server.
- [ ] **2.6** Edge function input validation — for each function, confirm body is parsed + shape-checked before use; bad input returns 400, not 500. Track per-function in §3.
- [ ] **2.7** Error messages — grep edge functions for `error.message` being returned to client; ensure no secrets/SQL/stack leaks.
- [ ] **2.8** CORS allowlist (`supabase/functions/_shared/cors.ts`) — production custom domain present? No `*` fallback? Localhost only matches dev pattern.
- [ ] **2.9** `verify_jwt = false` audit — list every function in `supabase/config.toml` with `verify_jwt = false`. For each: either (a) validates JWT in code, or (b) is intentionally public (document why in §14).
- [ ] **2.10** Service-role key — grep client `src/` for `SERVICE_ROLE`; should be zero hits. Confirm only edge functions reference it.
- [ ] **2.11** Storage bucket policies — `chat-attachments`, `generated-images`, `workspace-files` all owner-scoped via `(storage.foldername(name))[1] = auth.uid()::text` pattern.
- [ ] **2.12** Auth — confirm leaked-password (HIBP) ON, email confirmation ON (unless intentionally off), password reset page exists at `/reset-password` (currently MISSING per route map — flag).
- [ ] **2.13** Rate limiting — chat, image-gen, web-search, browser, import. Per-user cap via DB counter or in-memory token bucket in edge function.
- [ ] **2.14** `app_config` table — RLS denies all client reads; only service-role accesses.
- [ ] **2.15** `user_api_keys` table — RLS allows owner SELECT of `key_preview` only; encrypted bytea never readable client-side.
- [ ] **2.16** Update `security--update_memory` document with intentional-public surfaces and accepted findings.

---

## 3. Backend reliability — edge functions

For each function, mark each column. Functions list captured during 1.2.

| # | Function | a:CORS pre | b:CORS err | c:catch | d:idempotent | e:no-key UX | f:disconnect | g:concurrency | h:no-5xx-7d |
|---|----------|------------|------------|---------|--------------|-------------|--------------|---------------|-------------|
| 1 | chat | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] |
| 2 | chat-multi | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] |
| 3 | chat-guardian | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] |
| 4 | observer-watch | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 5 | observer-chat | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] |
| 6 | memory-extract | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 7 | memory-reflect | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 8 | memory-synthesize | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 9 | memory-decay | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] | [ ] |
| 10 | memory-candidate-action | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 11 | mnemos-decay | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] | [ ] |
| 12 | mnemos-consolidate | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 13 | mnemos-dialectic | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 14 | mnemos-soften | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] | [ ] |
| 15 | journal-write | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] |
| 16 | journal-cron | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 17 | import-chatgpt | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] | [ ] |
| 18 | clear-import | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 19 | delete-import | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 20 | generate-image | [ ] | [ ] | [ ] | n/a | [ ] | n/a | n/a | [ ] |
| 21 | extract-persona | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] |
| 22 | profile-chat | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] |
| 23 | profile-deep-analysis | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 24 | crisis-followup | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 25 | checkpoint-restore | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 26 | checkpoint-diff | [ ] | [ ] | [ ] | n/a | n/a | n/a | n/a | [ ] |
| 27 | agent-config-save | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 28 | luca-initiate | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 29 | luca-pulse | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 30 | scheduled-task-run | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 31 | subagent-run | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 32 | anima-dispatch | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] |
| 33 | anima-think | [ ] | [ ] | [ ] | n/a | [ ] | [ ] | n/a | [ ] |
| 34 | anima-initiate | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 35 | anima-dream | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 36 | anima-question | [ ] | [ ] | [ ] | n/a | [ ] | n/a | n/a | [ ] |
| 37 | anima-reflect | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 38 | anima-observe | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 39 | anima-consolidate | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 40 | anima-connect | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 41 | anima-emotional-state | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] |
| 42 | anima-believe | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] |
| 43 | anima-web-search | [ ] | [ ] | [ ] | n/a | [ ] | n/a | n/a | [ ] |
| 44 | anima-web-read | [ ] | [ ] | [ ] | n/a | [ ] | n/a | n/a | [ ] |
| 45 | anima-image-create | [ ] | [ ] | [ ] | n/a | [ ] | n/a | n/a | [ ] |
| 46 | anima-tool-execute | [ ] | [ ] | [ ] | n/a | [ ] | n/a | n/a | [ ] |
| 47 | anima-browser | [ ] | [ ] | [ ] | n/a | [ ] | n/a | n/a | [ ] |
| 48 | anima-workspace-file | [ ] | [ ] | [ ] | n/a | n/a | n/a | n/a | [ ] |
| 49 | anima-heartbeat | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 50 | anima-social-moltbook | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] |
| 51 | anima-social-x | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | n/a | [ ] |
| 52 | skills-distill | [ ] | [ ] | [ ] | [ ] | [ ] | n/a | [ ] | [ ] |
| 53 | skills-manage | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 54 | openclaw-pair | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 55 | openclaw-deploy | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 56 | openclaw-enqueue | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 57 | openclaw-register-result | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |
| 58 | openclaw-status | [ ] | [ ] | [ ] | n/a | n/a | n/a | n/a | [ ] |
| 59 | openclaw-heartbeat | [ ] | [ ] | [ ] | [ ] | n/a | n/a | n/a | [ ] |

### DB-side reliability
- [ ] **3.51** Every `SECURITY DEFINER` function has explicit `SET search_path = public` (verify against `pg_proc`).
- [ ] **3.52** No `CHECK` constraints using `now()`/`current_timestamp` or other non-immutable expressions (use validation triggers instead).
- [ ] **3.53** `invoke_edge_function()` is the single pg_net gateway; no scattered `net.http_post` calls in cron jobs (`cron.job` body grep).
- [ ] **3.54** `app_config` RLS — no client-readable rows; service-role only.
- [ ] **3.55** All triggers from `pg_trigger` documented (auto-profile, auto-settings, auto-agents, auto-memory_settings, auto-first-admin, updated_at). Verify each fires on insert via test account.

---

## 4. Data integrity & migrations

- [ ] **4.1** Foreign-key audit — every user-owned table cascades on `auth.users` delete (or has explicit cleanup trigger). Test in scratch account.
- [ ] **4.2** Indexes for hot paths:
  - `engrams (user_id, created_at desc)` ✓ verify
  - `engrams (user_id, state)` for graph filter
  - `connections (user_id, source_id)` and `(user_id, target_id)`
  - `messages (thread_id, created_at)` ✓ verify
  - `memories (user_id, is_deleted, created_at desc)`
  - `beliefs (user_id, confidence desc)`
  - `pending_revisions (user_id, status)`
  - `scheduled_tasks (user_id, next_run_at)` for runner
  - `cron job select queries`
- [ ] **4.3** `REPLICA IDENTITY FULL` audit — only on tables actually consumed by realtime old-row diffs. Trim others (perf cost).
- [ ] **4.4** Soft-delete consistency — every `memories` query filters `is_deleted=false`. Grep selects.
- [ ] **4.5** `update_updated_at_column` trigger attached wherever `updated_at` column exists. Diff `pg_trigger` ↔ table list.
- [ ] **4.6** Cascade-on-user-delete — create scratch account, populate, delete via auth admin, verify zero orphan rows.
- [ ] **4.7** Backup posture — confirm Lovable Cloud PITR ON; document RPO/RTO in this file.

---

## 5. Auth & onboarding flows

- [ ] **5.1** Email signup — confirmation email sent (or auto-confirm intentional), 4 trigger rows created (`profiles`, `agent_configs` x2, `user_settings`, `memory_settings`). Verify in DB after test signup.
- [ ] **5.2** Google OAuth signup — same trigger fan-out works.
- [ ] **5.3** Login + persistence — refresh tab, close/reopen, session survives; token auto-refresh works (check console for refresh log).
- [ ] **5.4** **MISSING `/reset-password` page** — currently no route. Add page that handles `type=recovery` URL hash + calls `supabase.auth.updateUser({ password })`. Add link from login page.
- [ ] **5.5** Logout — every Zustand store cleared. Audit each store for `signOut` cleanup.
- [ ] **5.6** Onboarding flow — fresh account → no console errors on each step → every step writes the right row.
- [ ] **5.7** `FirstRunGate` — handles auth → fresh account → first message gracefully; no double-redirect.
- [ ] **5.8** Missing-OpenRouter-key UX — chat composer disabled w/ clear "Add your key in Settings" message, link to `/settings/models`. No 500.

---

## 6. Core surfaces functional sweep

For each surface: empty / typical / heavy state.

- [ ] **6.1** `/chat[/:id]` — send, stream, regenerate, error retry, attachments, drag-drop, @mentions, permission cards, agent_error cards, code blocks, tables, links, kbd
- [ ] **6.2** `/memory` — Memories overview, Engrams (filters/search/sort), Beliefs, Graph (pan/zoom/realtime/filters/demo), Imports, Settings (persistence)
- [ ] **6.3** `/mind` — modulators, emotional state, memory pulse, beliefs, inner-life panels render real data (no mocks)
- [ ] **6.4** `/journal` — write, list, edit, cron-generated entries surface
- [ ] **6.5** `/profile` + identity/skills/revisions/schedule — read/write/dialectic-driven updates
- [ ] **6.6** `/import` — ChatGPT zip upload, progress banner, partial-failure recovery, delete-import
- [ ] **6.7** `/checkpoints` — list, diff viewer, restore, compare
- [ ] **6.8** `/group` — voice room, queue, transcript, listening bar (mock data ok if voice not wired)
- [ ] **6.9** `/workspace` + `/canvas/:artifactId` — artifact creation, viewer, persistence
- [ ] **6.10** `/settings/*` — every sub-route reachable, sticky save dirty-state, agent editor full round-trip
- [ ] **6.11** `/_mobile` — phone frame, bottom nav, mobile composer, drawers
- [ ] **6.12** ⌘K palette — every scope, every quick action wired
- [ ] **6.13** All 5 drawers — open/close/ESC/click-outside/focus-trap

---

## 7. Mnemos memory system end-to-end

- [ ] **7.1** Encode — chat turn → `memory-extract` → engrams + connections in DB. Verify via `supabase--read_query`.
- [ ] **7.2** Retrieval — spreading activation returns relevant engrams, surfaced in next prompt context.
- [ ] **7.3** Decay loop — `mnemos-decay` cron fires; strength decreases; respects `decay_rate` user setting.
- [ ] **7.4** Consolidation — `mnemos-consolidate` respects `dream_frequency`; episodic→semantic promotion observed; beliefs updated.
- [ ] **7.5** Dialectic — `mnemos-dialectic` writes pending_revisions; surfaced in `/profile/revisions`.
- [ ] **7.6** Dreaming — `dream()` writes narrative when OpenRouter key present.
- [ ] **7.7** Soften loop — `mnemos-soften` purpose documented + gated correctly.
- [ ] **7.8** Realtime — new engram in DB → appears in Graph live (no remount needed).
- [ ] **7.9** Memory candidates — pin/commit/edit/reject all functional; `auto_commit_stale_memory_candidates` cron runs.
- [ ] **7.10** Clear-all-memory — wipes engrams/connections/beliefs/cognitive_state/memories cleanly; no orphans.
- [ ] **7.11** Master switch (`mnemos_enabled=false`) — every loop early-returns; UI reflects disabled state.

---

## 8. Multi-agent + background cognition

- [ ] **8.1** `chat-multi` — parallel reasoning ensemble runs; tools dispatched; observer hook fires post-turn.
- [ ] **8.2** Observer — `chat-guardian` + `observer-watch` produce guardian messages without infinite loops.
- [ ] **8.3** Sub-agent dispatch — `subagent-run` async path → report-back message → realtime visualization in chat.
- [ ] **8.4** Heartbeat / pulse / initiate — verify cron rows + last-24h success > 95%; idempotent; quiet-hours respected.
- [ ] **8.5** Scheduled tasks — UI create → `scheduled-task-run` cron → completes or fails visibly with error message.
- [ ] **8.6** Tool surface — web-search, web-read, browser, image-create, workspace-file each return sane data; failures surface as `agent_error` message.
- [ ] **8.7** Crisis classifier + `crisis-followup` — fires on test phrase, follow-up scheduled, surfaces in notifications.
- [ ] **8.8** Skills — `skills-distill` runs after qualifying turns; skill UI controls work; skills feed into prompts.

---

## 9. Performance & scale

- [ ] **9.1** Seed test account: 5k engrams, 20k connections, 500 threads, 10k messages. Measure each surface.
- [ ] **9.2** Realtime channel audit — graph subscription count stays at 1 across remounts (currently uses `useMemoryRealtime`); verify no leaks.
- [ ] **9.3** 1000-row default limits — every list view paginates or cursor-loads. Audit `.limit()` calls in stores.
- [ ] **9.4** Bundle splitting — lazy-load `/canvas`, `/_mobile`, syntax-highlighter language packs. Measure pre/post.
- [ ] **9.5** Graph FPS at 500 / 1000 / 2000 nodes via demo mode; Barnes-Hut alpha sleep verified (CPU drops to ~0 when settled).
- [ ] **9.6** Hot row memoization — `MessageRow`, `EngramCard`, `SidebarChat` rows all `React.memo`'d with stable props.
- [ ] **9.7** Image storage — CDN cache headers on `generated-images` + `chat-attachments` signed URLs.
- [ ] **9.8** Edge cold-start budget — measure p50 cold start for `chat-multi`; consider pre-warm cron if > 800ms.

---

## 10. Observability & error handling

- [ ] **10.1** Global React error boundary on `<AppShell>`; per-route boundaries on `/canvas`, `/memory` Graph, `/mind`.
- [ ] **10.2** Toast system — every async failure (network, RLS, missing key) surfaces a toast; no silent failures.
- [ ] **10.3** Client error capture — `window.onerror` + `unhandledrejection` → `client_errors` table (or omit and rely on browser logs; document choice).
- [ ] **10.4** Edge function structured logging — `console.log(JSON.stringify({level,fn,user_id,request_id,...}))` consistent across functions.
- [ ] **10.5** Cron health surface — last-success-at per loop, viewable in `/mind` or `/settings/general`. Stale loop warning at > 2× expected interval.
- [ ] **10.6** `ConnectionBanner` — accurately reflects realtime channel state (CONNECTED / RECONNECTING / OFFLINE).

---

## 11. Accessibility & responsive

- [ ] **11.1** Keyboard nav every interactive element; visible `:focus-visible`; ESC closes modals/drawers.
- [ ] **11.2** Color contrast AA — body, whisper, eyebrow, mono tokens against `--surface` and `--canvas`. Test with axe.
- [ ] **11.3** `prefers-reduced-motion` — graph idle calm, shimmer freezes, drawer instant, onboarding stagger collapsed.
- [ ] **11.4** Screen-reader labels on all icon-only buttons (Rail, Composer actions, drawer triggers, ⌘K trigger).
- [ ] **11.5** Mobile (<768px) — every main route either uses mobile shell or has graceful fallback (no horizontal scroll, composer reachable).
- [ ] **11.6** Tablet (768-1024) — sidebar collapse + drawer overlap behavior sensible.
- [ ] **11.7** Forms — `<label for>` associations; errors `aria-live="polite"`.
- [ ] **11.8** Heading hierarchy — single h1 per route, h2/h3 nested correctly.

---

## 12. Visual polish & copy

- [ ] **12.1** Empty states — engrams, threads, journal, checkpoints, scheduled tasks, skills, imports, beliefs, pending revisions, sub-agents.
- [ ] **12.2** Loading skeletons (not spinners) on first paint of each route.
- [ ] **12.3** Error states distinct from empty; offer recovery action ("Retry", "Open settings").
- [ ] **12.4** Microcopy pass — eyebrow consistency, sentence-case discipline, no developer jargon.
- [ ] **12.5** Motion — no jank on route transitions; drawer slide 60fps; graph idle silent.
- [ ] **12.6** Favicon, social-share `og:` meta, robots.txt, web manifest.
- [ ] **12.7** SEO basics — title < 60 chars, meta description < 160 chars per route, single H1, canonical tags.

---

## 13. Production launch gates

See [`PRODUCTION_LAUNCH_CHECKLIST.md`](./PRODUCTION_LAUNCH_CHECKLIST.md). All gates must be `[x]` to launch.

---

## 14. Decision log + open questions + backend asks

### Decision log (append-only)
Format: `YYYY-MM-DD HH:MM · §N.M · what · why`

- 2026-05-02 · §0 · audit doc and launch checklist created · plan approved by Riley; doc is single source of truth for production-readiness work going forward

### Open questions (escalations / `[!]` items)
_(none yet)_

### Backend asks (`[B]` items needing Lovable migrations)
_(none yet — log here when an audit item requires a schema change)_

### Accepted-risk register (security findings intentionally not fixed)
_(none yet — mirror to `security--update_memory` when added)_
