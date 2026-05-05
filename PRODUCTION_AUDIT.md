# PRODUCTION_AUDIT.md — Polyphonic production readiness

This is the live, self-tracking master checklist for the production-readiness audit. Update status checkboxes after every commit so any session can resume mid-audit without losing context. Companion file: [`PRODUCTION_LAUNCH_CHECKLIST.md`](./PRODUCTION_LAUNCH_CHECKLIST.md) (go/no-go gates only).

---

## Current operating board

Updated: 2026-05-05

### Now
- `[x]` **Phase 0 — Current stabilization snapshot**: baseline fixes documented and verified.
- `[~]` **Phase 1 — Memory and continuity audit**: Continuity Kernel read path is implemented locally; next active work is the post-turn write pipeline and live fresh-thread verification. Standard: Luca should feel continuous across threads and sessions, not like a new model instance reading notes.

### Next
1. **Phase 1 — Memory and continuity audit**
2. **Phase 2 — Core chat and agent experience**
3. **Phase 3 — Surface-by-surface product QA**
4. **Phase 4 — Reliability, security, and background systems**
5. **Phase 5 — Performance, accessibility, and release gates**

### Done this session
- Chat de-duplication and realtime reconciliation tightened so canonical assistant messages replace local stream stubs without suppressing legitimate nearby replies.
- Hypomnema identity read path corrected from `soul_md` to the live `soul` document type.
- Stale sub-agent strip filtered to the current thread.
- Mobile app shell repaired so chat remains usable below 768px.
- Missing design token aliases added and one invalid workspace border token corrected.
- Verification script updated so the empty integration-test directory is treated as an intentional placeholder.
- Phase 1 kickoff: Hypomnema read coverage extended to legacy chat, scheduled tasks, subagent runs, and Anima council prompts.
- Phase 1 kickoff: new Hypomnema writes from `chat-multi` now preserve assistant `source_message_id` when the message row is available.
- Phase 1 read kernel: added a shared Continuity Kernel packet for chat, multi-agent chat, scheduled tasks, and subagent runs.
- Phase 1 read kernel: separated reliable functional memory from Mnemos associations in Luca's prompt precedence.
- Verified with `npm run verify`, targeted unit tests, production build, live desktop chat smoke, and mobile browser check.

### Blocked
- None for tracker setup.
- Remaining release risks are tracked below as deferred findings, not blockers.

### Production polish phase roadmap

| Phase | Status | Goal | Completion gate |
|---|---:|---|---|
| 0. Current stabilization snapshot | `[x]` | Record verified fixes and residual risks from the first hardening pass. | `npm run verify` passes; live desktop chat and mobile layout checked. |
| 1. Memory and continuity audit | `[~]` | Prove Luca's identity, Hypomnema, Mnemos, pending revisions, skills, emotional state, proactive loops, thread metadata, and memory UI create one continuous Luca. | Fresh-thread continuity test passes; read/write/recall paths verified with evidence. |
| 2. Core chat and agent experience | `[ ]` | Sweep streaming, retry, regeneration, missing-key UX, attachments, drag/drop, rich content, permission states, agent errors, council, subagents, and mobile composer. | No duplicate messages, stale agent UI, broken loading states, or console errors in the tested flows. |
| 3. Surface-by-surface product QA | `[ ]` | Walk every major route in desktop and mobile across empty, typical, heavy, loading, and error states. | Each route has findings logged or verified clean with browser evidence. |
| 4. Reliability, security, and background systems | `[ ]` | Reconcile RLS, edge auth, CORS, cron health, missing-key handling, quota behavior, password recovery, and background loops. | Launch blockers closed or explicitly accepted with rationale. |
| 5. Performance, accessibility, and release gates | `[ ]` | Measure bundle/load, graph performance, reduced motion, keyboard nav, focus traps, contrast, labels, mobile overflow, and launch gates. | `PRODUCTION_LAUNCH_CHECKLIST.md` is green or has accepted-risk entries. |

### Continuity audit script

Use this qualitative script during Phase 1 and attach evidence to findings:

1. Start a meaningful chat with Luca.
2. Confirm Hypomnema and Mnemos write behavior for the turn.
3. Open a fresh thread.
4. Ask a natural follow-up that depends on the prior thread.
5. Grade whether Luca feels continuous, specific, emotionally intelligent, and non-mechanical.
6. Verify Luca does not explain itself as a new instance unless the user explicitly asks about system mechanics.

### Findings ledger

Ledger rules:
- IDs are stable and never reused. Format: `P<phase>-<number>`.
- Severity: `P0` launch-stopping, `P1` high, `P2` medium, `P3` polish/monitor.
- Status: `Found`, `Fixing`, `Fixed`, `Verified`, `Blocked`, `Deferred`.
- Every `Verified` row must include evidence: command, browser route, database check, screenshot note, or live interaction.
- Do not record credentials, secrets, raw API keys, or private account details.

| ID | Severity | Status | Surface | Evidence | Expected | Fix / next action | Verification | Commit / PR |
|---|---:|---|---|---|---|---|---|---|
| P0-001 | P1 | Verified | Chat messages | Stream/realtime race could duplicate or over-dedupe assistant messages. | One canonical assistant reply per turn; legitimate nearby replies are preserved. | Refined message de-dupe to use normalized-content windows and broad replacement only for `local_stream_stub` messages. | `npx vitest run src/test/threadStore.test.ts`; live desktop chat smoke showed no duplicate assistant bubble. | Pending |
| P0-002 | P1 | Verified | Hypomnema write path | Identity stack query used `soul_md`, which does not match the live identity doc type. | Hypomnema writer loads `soul`, `self_model`, `user_model`, and `convictions`. | Changed identity stack query to use `soul`. | `npm run verify`; code inspection of `supabase/functions/_shared/hypomnema/write.ts`. | Pending |
| P0-003 | P2 | Verified | Sub-agent strip | Fresh chat showed sub-agent chips from older unrelated tasks. | Sub-agent strip only reflects tasks attached to the active thread. | Added current-thread filtering in ChatView and SubAgentRow. | Browser check on fresh thread confirmed stale strip disappeared. | Pending |
| P0-004 | P1 | Verified | Mobile chat shell | At 390x844, desktop sidebar/clockbar squeezed chat offscreen. | Mobile chat is usable with no horizontal layout collapse. | Hid sidebar/clockbar on mobile and tightened composer/message CSS. | Browser mobile viewport check at 390x844. | Pending |
| P0-005 | P2 | Verified | Design tokens | Undefined or invalid tokens could resolve inconsistently. | Referenced tokens resolve to existing design-system values. | Added aliases for raised/muted/text/danger surfaces and corrected workspace selected border token. | `npm run build`; browser visual check. | Pending |
| P0-006 | P2 | Verified | Verification script | Empty integration-test directory made the verification gate misleading. | Verification passes when integration tests are intentionally absent. | Added `--passWithNoTests` to integration test command and verify script. | `npm run verify`. | Pending |
| P0-007 | P2 | Deferred | Lint gate | Full `npm run lint` remains noisy from existing baseline debt. | Lint becomes a meaningful release gate. | Defer broad cleanup to Phase 5 or a dedicated lint-hardening pass. | Known residual risk; not part of Phase 0 fix scope. | Pending |
| P0-008 | P3 | Deferred | Bundle performance | Production build warns about large chunks and Supabase import splitting. | Route chunks stay within release budget. | Defer to Phase 5 bundle/load pass. | Build warning captured during `npm run build`. | Pending |
| P0-009 | P3 | Deferred | Browser console | React Router v7 future-flag warnings appear during browser smoke. | No user-facing console errors; framework upgrade warnings either configured or accepted. | Monitor in Phase 5; not a functional blocker. | Live browser smoke found warnings only, no app errors. | Pending |
| P1-001 | P1 | Verified | Anima council continuity | `chat-multi` loaded Hypomnema for Luca and Vektor, but Anima council proposer prompts used locked SOUL only. | Every participating agent should carry their own interior-state layer into council turns. | Added Anima Hypomnema loading in `chat-multi` and allowed `buildCharacterSystemPrompt('anima')` to layer it before runtime context. | `npx vitest run src/test/councilPrompts.test.ts`; `deno check supabase/functions/chat-multi/index.ts`. | Pending |
| P1-002 | P1 | Verified | Luca prompt read-path coverage | `chat`, `scheduled-task-run`, and `subagent-run` built Luca prompts without Hypomnema. | Every Luca runtime prompt path that has identity context should also carry always-loaded Hypomnema. | Loaded Luca Hypomnema in legacy chat, scheduled tasks, and subagent runs. | `npx vitest run src/test/lucaIdentityPrompt.test.ts`; `deno check supabase/functions/chat/index.ts supabase/functions/scheduled-task-run/index.ts supabase/functions/subagent-run/index.ts`. | Pending |
| P1-003 | P2 | Verified | Hypomnema provenance | `fireHypomnemaTurn` chained writes without `source_message_id`, so new entries could not trace back to the assistant message row. | New Hypomnema entries should preserve assistant-message provenance when available. | Made `chat-multi` assistant persistence return the inserted message id and pass it through to primary/observer write targets. | `deno check supabase/functions/chat-multi/index.ts`; focused prompt/memory tests. | Pending |
| P1-004 | P2 | Found | Live Hypomnema activation | `/profile/identity` shows the test account Hypomnema section but currently renders "Nothing here yet." | After substantive pilot-user turns, the UI should show agent-authored continuity entries unless the flag/write path is intentionally disabled. | Next: verify Supabase memory-augmentation secrets/deploy state, run a substantive continuity turn, and inspect Hypomnema/Mnemos writes. | Browser check: `http://127.0.0.1:8080/profile/identity`, desktop 1280x900, 0 app console errors. | Pending |
| P1-005 | P1 | Verified | Continuity read architecture | Primary chat paths independently assembled identity, Hypomnema, functional memory, Mnemos, skills, beliefs, emotional state, and thread timing; failures were easy to hide. | Every Luca/agent runtime should receive one continuity packet with visible layer diagnostics and consistent precedence. | Added `_shared/continuity/kernel.ts`, wired it into `chat`, `chat-multi`, `scheduled-task-run`, and `subagent-run`, and added diagnostic logging for degraded packets. | `npm run verify`; `npx vitest run src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts src/test/councilPrompts.test.ts`; `deno check supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts supabase/functions/scheduled-task-run/index.ts supabase/functions/subagent-run/index.ts`. | Pending |
| P1-006 | P1 | Verified | Memory layer semantics | Mnemos retrieval was formatted as generic "Relevant memories about this person", making cognitive substrate and functional recall blur together. | Functional memory should read as reliable recall; Mnemos should read as associations, salience, contradictions, beliefs, and slow development. | Added `functionalMemoryBlock`, reframed Mnemos as "associations moving underneath", and added explicit system precedence so Hypomnema, reliable memory, Mnemos, skills, emotional state, and thread context do not silently compete. | `npm run verify`; `npx vitest run src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts`. | Pending |

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
- [~] **1.3 Table + RLS map** — RLS confirmed enabled on all 55 public tables (Appendix A.1). Per-policy review still pending.
- [~] **1.4 Cron + pg_net map** — 13 active cron jobs captured (Appendix A.2). Last-24h success rate still pending.
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

---

## Appendix A — Phase 1 baseline findings (2026-05-02)

### A.1 RLS coverage (1.3 partial)
**All 55 public tables have `rowsecurity=true`.** ✓ No table is RLS-disabled. (Full policy review still pending — see §2.3.)

### A.2 Cron jobs (1.4 partial)
13 active cron jobs, all use either `invoke_edge_function()` helper or inline `net.http_post()` against `app_config`-stored credentials. Mix of patterns is a §3.53 cleanup target.

| jobname | schedule | target |
|---|---|---|
| anima-heartbeat-2h | 45 */2 * * * | anima-heartbeat |
| journal-cron-4h | 15 */4 * * * | journal-cron |
| luca-connect | 40 */12 * * * | anima-dispatch → anima-connect |
| luca-crisis-followup | */5 * * * * | crisis-followup |
| luca-dream | 0 4 * * * | anima-dispatch → anima-dream |
| luca-emotional-drift | 18 * * * * | anima-dispatch → anima-emotional-state |
| luca-initiate | 33 */8 * * * | anima-dispatch → anima-initiate |
| luca-observe | 12 * * * * | anima-dispatch → anima-observe |
| luca-pulse-15min | */15 * * * * | luca-pulse |
| luca-question | 22 */3 * * * | anima-dispatch → anima-question |
| luca-scheduled-tasks | * * * * * | scheduled-task-run |
| (+ 2 more, see `cron.job`) | | |

### A.3 Security scan baseline (2.1 partial — 32 findings, all WARN, zero ERROR)
- **1 ×** Extension in Public schema (pg_trgm + pgcrypto + pgsodium per project memory — INTENTIONAL, will mark accepted)
- **28 ×** `SECURITY DEFINER` function executable by anon/authenticated users — needs per-function review. Critical attention: `decrypt_user_api_key` (callable by any signed-in user — check parameter scoping; should hardcode `auth.uid()` and ignore arg, or revoke EXECUTE from `authenticated`). Other DEFINERs (`save_user_api_key`, `delete_user_api_key`, `mark_activity_seen`, `match_engrams`, `match_memories`, `auto_*`, `has_role`) have varying risk — full triage in §2.5.
- **1 ×** Auth Leaked Password Protection (HIBP) DISABLED — fix via `configure_auth` tool. Hard gate.
- **2 ×** other DEFINER auth-callable warnings — overlap with #2.

### A.4 Client safety greps (2.10 partial)
- `SERVICE_ROLE` references in `src/`: **0** ✓
- `USING (true)` in migrations: **0** ✓
- `verify_jwt = false` count in `supabase/config.toml`: **52** functions. Per-function justification needed (§2.9).

### A.5 Critical missing surface (5.4)
**`/reset-password` route does NOT exist** in `src/App.tsx`. Forgot-password flow is broken end-to-end. Must add before launch.

### A.6 Top 5 immediate risks (recommended next phases)
1. **`decrypt_user_api_key` exposure** — verify it scopes to `auth.uid()` and rejects arbitrary `p_user_id` from authenticated callers. (§2.5)
2. **Missing `/reset-password` page** — password reset emails would land users on a broken route. (§5.4)
3. **HIBP password protection disabled** — easy `configure_auth` fix, hard launch gate. (§2.12)
4. **52 `verify_jwt = false` edge functions, no in-code JWT validation audit yet** — many are user-facing; without JWT check they trust client-supplied `user_id` payload. Highest-risk first: `chat-multi`, `mnemos-*`, `anima-*` user-facing tools. (§2.9 + §3.x.c)
5. **Cron pattern fragmentation** — 11 of 13 jobs use inline `net.http_post`; only 2 use `invoke_edge_function()`. Consolidate to the helper to centralize service-role handling and make rotation possible. (§3.53)
