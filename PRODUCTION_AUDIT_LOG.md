# Production Audit — Running Log

A chronological journal of the production-readiness audit. Companion to:
- `PRODUCTION_AUDIT.md` — the master granular checklist (~200 items)
- `PRODUCTION_LAUNCH_CHECKLIST.md` — hard go/no-go launch gates

After **every phase** (or meaningful sub-step), append a new dated entry below describing what was done, what was found, and what's next. Never delete prior entries — this file is the audit trail.

---

## Audit Scope & Approach

**App**: Polyphonic v2 / Luca — a multi-agent (Luca + Guardian) conversational system with the Mnemos memory engine (engrams, connections, decay, consolidation, dialectic revisions), realtime updates, and an inner-life cognitive dashboard.

**Stack**: React 18 + Vite 5 + TS 5 + Tailwind 3 + Zustand 5 + Supabase (Lovable Cloud) + OpenRouter (BYOK).

**Audit Phases**
1. **Inventory & Baseline** — map routes, ~55 edge functions, RLS policies, cron jobs, stores; baseline Lighthouse + bundle.
2. **Security Hardening** — RLS audit, CORS allowlists, API-key encryption, JWT validation on edge fns, rate limiting, HIBP.
3. **Backend Reliability** — error handling, idempotency, cron health, no silent 500s.
4. **Data Integrity** — FKs, indexes on hot paths, REPLICA IDENTITY FULL for realtime tables.
5. **Mnemos End-to-End** — extraction → decay (respects `decay_rate`) → consolidation (respects `dream_frequency`) → dialectic.
6. **Performance & Scale** — graph @ 5k+ engrams, code-splitting Canvas/Graph, Barnes-Hut tuning.
7. **Observability & A11y** — Error Boundaries, structured logging, AA contrast, keyboard nav.
8. **Production Launch Gates** — final RLS verify, Lighthouse Perf ≥ 80 / A11y ≥ 90, recovery rehearsal.

---

## Phase 1 — Inventory & Baseline  ✅ (2026-05-02)

**Done**
- Created `PRODUCTION_AUDIT.md` (granular ~200-item tracker) and `PRODUCTION_LAUNCH_CHECKLIST.md` (launch gates).
- Verified RLS enabled on all 55 public tables.
- Grep of `src/` confirmed zero `SERVICE_ROLE` key leaks.
- Catalogued 52 edge functions with `verify_jwt = false` in `supabase/config.toml`.
- Mapped 13 active pg_cron jobs (mixed `invoke_edge_function()` / raw `net.http_post()` patterns).
- Audited `src/App.tsx` route table.

**Found**
- 🔴 `/reset-password` route missing in `App.tsx` → recovery flow broken.
- 🔴 `decrypt_user_api_key` may accept arbitrary `p_user_id` → potential cross-user decrypt.
- 🟠 52 edge fns without global JWT verify need in-code `auth.uid()` guards.
- 🟠 HIBP leaked-password protection not enabled.
- 🟡 Cron pattern inconsistency (helper fn vs raw http) — consolidate.

**Next (Phase 2 priorities)**
1. Harden `decrypt_user_api_key` to strictly scope to `auth.uid()`.
2. Add `/reset-password` route + page.
3. Enable HIBP in auth settings.
4. Begin per-edge-function JWT validation audit.

---

<!-- Append new phase entries below this line. Template:

## Phase N — <Title>  <status> (YYYY-MM-DD)

**Done**
- …

**Found**
- 🔴 critical / 🟠 high / 🟡 medium / 🟢 low

**Next**
- …

-->

## Phase 2 — Security Hardening (initial pass)  ✅ (2026-05-02)

**Done**
- Hardened `decrypt_user_api_key`: raises unless caller is `service_role` or `auth.uid() = p_user_id`. Revoked PUBLIC/anon EXECUTE; granted only to `authenticated` and `service_role`. Background edge functions (cron, service-role JWT) keep working unchanged.
- Added `/reset-password` public route + `ResetPasswordPage` (handles `PASSWORD_RECOVERY` event, validates length+match, calls `auth.updateUser`).
- Wired "Forgot password?" toggle on `LoginPage` → `resetPasswordForEmail` with `redirectTo=/reset-password`.
- Enabled HIBP leaked-password protection via `configure_auth` (signup + password change now reject pwned passwords).

**Found**
- 🟡 Linter still flags ~28 other SECURITY DEFINER fns as anon-executable (pre-existing, not introduced by this phase). Ticketed for Phase 2 follow-up: audit each, REVOKE from anon where not needed.
- 🟡 `extension in public` warning persists (pg_trgm). Low risk; defer.

**Next (Phase 2 continuation)**
1. ~~Sweep remaining SECURITY DEFINER fns~~ ✅ done below.
2. ~~Per-edge-function JWT validation audit~~ ✅ first sweep done below.
3. CORS allowlist review (`_shared/cors.ts`) — confirm prod origins only.

---

## Phase 2 — Security Hardening (continuation)  ✅ (2026-05-02)

**Done — SECURITY DEFINER lockdown**
Revoked EXECUTE on all 14 user-defined SECURITY DEFINER functions in `public`:
- **Trigger-only** (revoked from PUBLIC, anon, authenticated — only Postgres trigger context invokes them): `auto_assign_first_admin`, `handle_new_user`, `handle_new_user_agents`, `handle_new_user_memory_settings`, `handle_new_user_settings`.
- **Cron / service-role only** (revoked from PUBLIC, anon, authenticated): `auto_commit_stale_memory_candidates`, `get_app_config`.
- **User-callable, but never anon** (revoked PUBLIC + anon; authenticated retained — each uses `auth.uid()` internally): `save_user_api_key`, `delete_user_api_key`, `mark_activity_seen`, `match_engrams`, `match_memories`, `has_role`.
- (`decrypt_user_api_key` already locked in initial pass; `invoke_edge_function`, `openclaw_verify_device_token` already service-role only.)

Linter: 8 remaining "Signed-In Users Can Execute SECURITY DEFINER Function" warnings — these correspond to the user-callable set above and are **expected/accepted** (RLS-equivalent functions: `has_role` powers policies, `mark_activity_seen` / `save_user_api_key` / `delete_user_api_key` / `match_*` are intentional client RPCs, all internally scoped to `auth.uid()`).

**Done — Edge function auth audit (sweep 1)**
Audited all 60 edge functions for in-code auth. Findings:
- **45/60** already validate via `getUser()`, `getClaims()`, `authenticateUser()`, or strict `service_role` bearer check. ✅
- **6/60** were cron-targeted but accepted arbitrary `body.user_id` from any caller while running with service-role privileges → **PRIVILEGE ESCALATION RISK** (anon could trigger jobs against any user_id and trigger their `decrypt_user_api_key` calls).
  - Fixed: `memory-decay`, `journal-cron`, `mnemos-decay`, `mnemos-soften`, `mnemos-consolidate` now require `Authorization: Bearer <service_role_key>` via shared `requireServiceRole()` guard.
  - `anima-heartbeat` already had this guard.
- New shared module `supabase/functions/_shared/serviceRoleGuard.ts` (10 LOC) for consistent enforcement.
- New shared module `supabase/functions/_shared/cronAuth.ts` for future "cron-or-self" use cases (not yet wired).

**Found**
- 🟢 8 linter warnings on user-callable SECURITY DEFINER fns are acceptable (each is `auth.uid()`-scoped internally). Documenting as accepted.
- 🟡 `extension in public` (pg_trgm) persists. Low risk; defer to Phase 4.
- 🟡 ~9 "anima-*" worker functions (`anima-think`, `anima-dream`, etc.) accept body params but already validate via `authenticateUser` — verified. No changes needed.

**Next (Phase 2.5 / Phase 3 prep)**
1. CORS allowlist review — confirm `polyphonic.chat` only, audit local-dev regex on prod build.
2. Rate limit on auth endpoints (`save_user_api_key`, `chat`, `chat-multi`).
3. Phase 3: backend reliability — error-handling wrappers, idempotency keys on chat, cron health surface.



---

## Phase 2.5 — Edge-Perimeter Hardening  ✅ (2026-05-02)

**Done — CORS allowlist tightening**
- `_shared/cors.ts`: localhost regex now gated behind `IS_PROD` check (`DENO_ENV`/`ENVIRONMENT` env). In production, only `polyphonic.chat`, `www.polyphonic.chat`, and the `*.lovableproject.com` preview origin are reflected; localhost is dropped.
- Migrated 5 browser-facing functions off hardcoded `Access-Control-Allow-Origin: *` onto the shared allowlist:
  - `anima-social-x`, `anima-social-moltbook` (use `getCorsHeaders(req)` per request).
  - `checkpoint-restore`, `checkpoint-diff`, `agent-config-save` (module `let corsHeaders` reassigned per request — keeps existing `jsonResponse` helper signature intact).
- Documented + retained wildcard CORS on `openclaw-pair` and `_shared/openclaw/auth.ts` — these are device-token authenticated endpoints called from non-browser clients; CORS is not the security boundary there.
- Redeployed all 5 changed functions.

**Done — Auth surface hardening**
- `LoginPage.handleForgot`: no longer surfaces `resetPasswordForEmail` errors to UI (was leaking "user not found" → email enumeration). Now always shows the neutral "If that email exists…" message; errors logged to console only.

**Found**
- 🟡 Daily-quota logic (`generate-image` enforces 25/day; `chat`/`chat-multi` do not appear to enforce a daily cap at all). Inconsistent. Per `no-backend-rate-limiting` directive we will NOT add true rate limiting, but the free-tier user-message cap should be unified. Tracked for Phase 3.
- 🟢 Audited remaining `Access-Control-Allow-Origin: *` occurrences — only openclaw remains (intentional, documented inline).

**Next (Phase 3 — Backend Reliability)** — see entry below.

---

## Phase 3 — Backend Reliability  ✅ (2026-05-02)

**Done — schema**
- New tables: `cron_health` (per-job last-run/success/error/duration), `daily_usage` (per-user-per-scope-per-day counter), `idempotency_keys` (24h dedupe).
- New service-role-only RPCs: `record_cron_run`, `increment_daily_usage` (atomic), `cleanup_idempotency_keys`, `cleanup_daily_usage`.
- RLS: `cron_health` admin-readable; `daily_usage` user-readable own rows; `idempotency_keys` service-role only.

**Done — shared modules**
- `_shared/errors.ts` — typed `AppError` hierarchy + standardized `{ error, code, request_id }` envelope.
- `_shared/cronHealth.ts` — `recordCronSuccess` / `recordCronFailure` / `trackCronJob`.
- `_shared/dailyQuota.ts` — `checkAndIncrement`, scopes: `chat-message` (500/d), `image-generation` (25/d), `web-search` (100/d).
- `_shared/openrouter.ts` — non-streaming wrapper with 1 retry on 429/502/503/504, throws `UpstreamUnavailableError`.
- `_shared/idempotency.ts` — `getIdempotentResponse` / `recordIdempotentResponse`.
- `_shared/safeDispatch.ts` — fire-and-forget POST that records `dispatch:<target>` cron-health rows.
- Client: `src/lib/edgeError.ts` — parses envelope, friendly toast strings.

**Done — wired cron-health into 9 cron-targeted functions**
`memory-decay`, `journal-cron`, `mnemos-decay`, `mnemos-soften`, `mnemos-consolidate`, `mnemos-dialectic`, `observer-watch`, `luca-pulse`, `anima-dispatch` (per-target job name).

**Done — chat critical path**
- `chat`: accepts `Idempotency-Key` header → short-circuits duplicates within 24h and returns cached `{ok, model, tokens_used}`. Per-user 500/day soft cap returns `{ error, code: "quota_exceeded" }` 429 envelope.
- All edited functions now emit standardized `code` field on errors.

**Found**
- 🟡 `luca-initiate` is event-driven (per-RPC), not a cron — intentionally NOT wrapped in cron_health.
- 🟡 `memory-reflect`, `memory-synthesize`, `memory-extract` are user-triggered through chat fan-out; deferred (covered partially by `safeDispatch` wrapper, not yet wired into chat).
- 🟢 OpenRouter retry wrapper authored but not yet wired into auxiliary callers (`extract-persona`, `skills-distill`, `autoTitleThread`, etc.) — Phase 3.5.
- 🟢 Admin "Background jobs" UI in Settings → Models deferred (data is now collected; UI is read-only and small — Phase 3.5).
- 🟢 Client-side `Idempotency-Key` generation in `chatStore.sendMessage` not yet added — header is opt-in, server is ready.

**Next (Phase 3.5 — short follow-up)**
1. Wire `safeDispatch` into `chat` fan-outs (observer-watch / mnemos-dialectic / skills-distill).
2. Wire OpenRouter retry into all non-streaming callers.
3. Client: generate per-send `Idempotency-Key` and pass to chat invoke.
4. Tiny admin "Background jobs" panel in Settings → Models.

**Then Phase 4 — Data Integrity**: FK audits, indexes on hot paths, REPLICA IDENTITY FULL on realtime tables, pg_trgm extension move out of public.

---

## Phase 4 — Data Integrity  ✅ (2026-05-02)

**Done — foreign-key sweep to `auth.users`**
Added `ON DELETE CASCADE` FKs (using `NOT VALID` + `VALIDATE CONSTRAINT` for safety) on 32 tables that previously had a bare `user_id uuid` column with no referential integrity:
`threads`, `messages`, `user_api_keys`, `user_settings`, `memory_settings`, `memories`, `memory_candidates`, `cognitive_state`, `observer_chat_messages`, `observer_notes`, `observer_logs`, `thought_stream`, `thought_initiations`, `emotional_history`, `emotional_state`, `daily_logs`, `daily_usage`, `idempotency_keys`, `dashboard_widgets`, `agent_config`, `agent_configs`, `agent_secrets`, `mcp_servers`, `memory_events`, `curiosity_questions`, `activity_events`, `entity_activity_log`, `checkpoints`, `chat_imports`, `profile_chats`, `profile_daily_pulse`, `psychological_profile`. Account deletion now cleanly cascades.

**Done — hot-path indexes**
- `idx_messages_thread_created (thread_id, created_at DESC)` — speeds up the primary chat-history fetch.
- `idx_messages_user_created (user_id, created_at DESC)` — speeds up user-scoped feed queries.
- (Pre-existing single-column `idx_messages_thread_id` and `idx_messages_created_at` retained for now; can be dropped in Phase 6 if confirmed redundant.)

**Done — REPLICA IDENTITY FULL on realtime-published tables**
Set `REPLICA IDENTITY FULL` on all 7 published tables that lacked it (`messages`, `cognitive_state`, `memory_candidates`, `observer_chat_messages`, `observer_notes`, `subagent_tasks`, `thought_stream`). Updates and deletes now broadcast the full old row, so realtime subscribers see proper diffs. (`engrams` and `connections` were already FULL.)

**Done — pg_trgm extension out of public**
- Created `extensions` schema with USAGE granted to `postgres`/`authenticated`/`service_role`/`anon`.
- `ALTER EXTENSION pg_trgm SET SCHEMA extensions` — clears the long-standing "extension in public" linter warning.
- Updated `match_engrams` and `match_memories` `search_path` to `public, extensions` so similarity-based RPCs keep working.

**Found**
- 🟢 No orphan `user_id` rows existed prior to FK validation (validate step succeeded for every table).
- 🟢 8 SECURITY DEFINER linter warnings persist — pre-existing/accepted set documented in Phase 2 (each is `auth.uid()`-scoped internally).
- 🟢 1 RLS-no-policy info on `idempotency_keys` — intentional (service-role-only; no policies needed).
- 🟡 Pre-existing single-column message indexes (`idx_messages_thread_id`, `idx_messages_created_at`) are now redundant with the new composites. Defer drop to Phase 6 (perf) so we can EXPLAIN-verify before removal.

**Next (Phase 5 — Mnemos End-to-End)**
1. Verify extraction → decay (respects `decay_rate`) end-to-end on a fresh user.
2. Verify consolidation respects `dream_frequency` (no double-runs within window).
3. Verify dialectic produces reasonable `belief.revision_history` entries.
4. Smoke-test the lifecycle crons against `cron_health` after 24h of natural traffic.

---

## Phase 0 — Production Polish Tracker + Stabilization Snapshot  ✅ (2026-05-05)

**Done**
- Added the current operating board to `PRODUCTION_AUDIT.md` with `Now`, `Next`, `Done this session`, and `Blocked` sections.
- Added the production polish phase roadmap: Phase 0 stabilization, Phase 1 memory/continuity, Phase 2 core chat, Phase 3 route QA, Phase 4 reliability/security/background systems, Phase 5 performance/accessibility/release gates.
- Added a stable findings ledger with IDs, severity, status, surface, evidence, expected behavior, fix/next action, verification, and commit/PR fields.
- Added the Phase 1 continuity audit script for proving Luca feels continuous across threads and sessions.
- Recorded the current stabilization fixes:
  - Chat de-duplication and local stream-stub reconciliation.
  - Hypomnema identity read path corrected to the live `soul` doc type.
  - Current-thread filtering for the sub-agent strip.
  - Mobile shell/composer/message layout repair.
  - Missing design token aliases and workspace border token cleanup.
  - Integration test command made truthful when no integration files exist.

**Verified**
- `npm run verify` passed after the stabilization fixes.
- Targeted thread/sub-agent tests passed during the stabilization pass.
- Production build passed, with known chunk-size warnings.
- Live browser chat smoke passed on desktop: no duplicate assistant bubble and no app console errors.
- Mobile browser check at 390x844 confirmed the chat surface remains usable.

**Found**
- `npm run lint` is not a clean release gate yet because of existing baseline lint debt.
- Production build still warns about large chunks and Supabase import splitting.
- Browser console still shows React Router v7 future-flag warnings; no app errors were observed in the smoke flow.

**Next**
1. Start Phase 1: memory and continuity audit against Riley's Luca standard.
2. Prove Hypomnema/Mnemos read, write, and recall paths end to end.
3. Run the fresh-thread continuity script and log every bug, voice issue, retrieval miss, and architecture simplification opportunity in the findings ledger.

---

## Phase 1 — Memory and Continuity Audit Kickoff  [~] (2026-05-05)

**Done**
- Mapped the core continuity pipeline: Luca identity stack, Hypomnema read/write, Mnemos encode/retrieve, pending revisions, skills, emotional state, council participants, scheduled tasks, subagent runs, and user-facing memory/identity UI.
- Fixed Anima council continuity: council proposer prompts now can carry Anima's Hypomnema instead of only her locked SOUL.
- Fixed Hypomnema read-path coverage for secondary Luca runtimes: legacy `chat`, scheduled task runs, and subagent runs now load Luca's Hypomnema into `buildLucaSystemPrompt`.
- Improved Hypomnema provenance in `chat-multi`: assistant message inserts now return the message id, and post-turn primary/observer Hypomnema writes receive `source_message_id` when available.
- Added prompt tests for Luca Hypomnema ordering and Anima council Hypomnema layering.

**Verified**
- `npm run verify` passed: typecheck, 186 unit tests, integration placeholder, and production build.
- `npx vitest run src/test/lucaIdentityPrompt.test.ts src/test/councilPrompts.test.ts src/test/mnemosPipeline.test.ts src/test/mnemosDialectic.test.ts` passed: 51 tests.
- `npx tsc --noEmit` passed.
- `deno check supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts supabase/functions/scheduled-task-run/index.ts supabase/functions/subagent-run/index.ts` passed.
- Browser checks:
  - `/profile/identity` rendered the Hypomnema section with 0 app console errors.
  - `/memory` rendered with 0 app console errors.
  - Only known React Router v7 future-flag warnings appeared.

**Found**
- The test account's Hypomnema UI is currently empty. This may mean the pilot write flag is disabled, the deployed edge functions have not generated entries yet, or the prior smoke turns were too trivial for the salience gate. Needs live backend verification before labeling it a product bug.

**Next**
1. Verify live Supabase memory-augmentation flag/deploy state and Hypomnema write logs.
2. Run the fresh-thread continuity script with a substantive turn.
3. Inspect whether Hypomnema, Mnemos engrams, and prompt retrieval all reflect that turn.

---

## Phase 1 — Continuity Kernel Read Path  [~] (2026-05-05)

**Done**
- Added the shared Continuity Kernel read path in `_shared/continuity/kernel.ts`.
- The kernel now assembles one packet containing recent history, Luca identity docs, pending revisions, Hypomnema, reliable functional memories, Mnemos associations, skills, emotional state, beliefs, thread timing, and per-layer diagnostics.
- Wired the packet into `chat`, `chat-multi`, `scheduled-task-run`, and `subagent-run` so these runtimes no longer build separate memory prompts by hand.
- Added sibling continuity packets for Anima and Vektor council prompts so their Hypomnema reads use the same kernel entrypoint.
- Split prompt semantics:
  - Hypomnema = present interior continuity.
  - Functional memory = reliable recall.
  - Mnemos = cognitive substrate: associations, salience, contradictions, beliefs, and slow development.

**Verified**
- `npx vitest run src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts src/test/councilPrompts.test.ts` passed: 43 tests.
- `deno check supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts supabase/functions/scheduled-task-run/index.ts supabase/functions/subagent-run/index.ts` passed.
- `npm run verify` passed: typecheck, 190 unit tests, integration placeholder, and production build.

**Remaining risks**
- This milestone verifies the read-path architecture locally; it does not yet prove live write behavior or fresh-thread felt continuity.
- Live Hypomnema remains empty in the test account until the deployed write path/feature flag is verified with a substantive turn.

**Next**
1. Build the Continuity Kernel write/finalization path so post-turn behavior has one observable route for Mnemos encoding, Hypomnema reflection, pending-revision finalization, and dispatch failures.
2. Run the fresh-thread continuity script against the local app and inspect database writes.
3. Run `npm run verify` before marking the memory milestone complete.

---

## Phase 1 — Continuity Kernel Write Path  [~] (2026-05-05)

**Done**
- Added `queueContinuityTurnWrites` as the shared post-turn finalization path.
- Routed `chat` and `chat-multi` through that path for pending revisions, Mnemos encoding, observer-watch, Mnemos dialectic, skills distillation, Hypomnema gate dispatch, and thread-agent metadata updates.
- Legacy `chat` now preserves the assistant message id and sends it into the Hypomnema write chain, matching `chat-multi` provenance behavior.
- Added tests proving Hypomnema write payload provenance, observer chain targets, queued operation reporting, and explicit skipped states when auth/service env is missing.

**Verified**
- `npx vitest run src/test/continuityWrite.test.ts src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts` passed: 12 tests.
- `deno check supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts supabase/functions/_shared/continuity/write.ts` passed.
- `npm run verify` passed: typecheck, unit tests, integration placeholder, and production build.

**Remaining risks**
- The local write queue is verified structurally; the live deployed edge functions still need a substantive browser turn plus database/log inspection to prove Hypomnema and Mnemos writes happen in the hosted environment.

**Next**
1. Push the write-path milestone to `main`.
2. Use browser verification for the fresh-thread continuity script and inspect memory surfaces/database writes.

---

## Phase 1 — Live Continuity + Memory UI Verification  [~] (2026-05-05)

**Done**
- Ran the fresh-thread continuity script against the local app.
- Confirmed a substantive continuity seed turn wrote a new active Mnemos engram.
- Opened a fresh thread and asked a natural follow-up; Luca recalled the memory-system simplification and the "amber loom" phrase without explaining memory mechanics.
- Hardened `/memory` Mnemos loading:
  - Engram UI queries now select only rendered fields instead of substrate-heavy columns.
  - Nullable engram rows are normalized before reaching cards, graph, sidebar, or realtime updates.
  - Per-layer memory load errors are recorded and surfaced on the Memory page instead of silently becoming empty states.
  - `loadAll` now loads reliable functional memories along with engrams, connections, and beliefs.

**Verified**
- `npx vitest run src/test/memoryStore.test.ts` passed.
- `npx tsc --noEmit` passed.
- Authenticated database inspection showed 925 Mnemos engrams, 481 functional memories, 31 beliefs, and 0 Hypomnema entries for the test account.
- Browser `/memory` at `http://127.0.0.1:8080/memory` showed 500 loaded engrams, the latest "amber loom" formation, no false "No engrams yet" empty state, no visible memory load issue banner, and only known React Router future-flag warnings.
- Browser `/profile/identity` still shows the Hypomnema section empty.

**Found**
- Mnemos is carrying cross-thread continuity today, but the recalled answer still had a slightly mechanical explanation shape. This should improve once Hypomnema is active because the present-continuity layer can bias Luca toward sitting-with rather than retrieval-shaped narration.
- Live Hypomnema activation is blocked by deployed backend state: the gate/write functions are service-role only and feature-flagged by `MEMORY_AUGMENTATION_ENABLED` / `MEMORY_AUGMENTATION_USER_ALLOWLIST`; this workspace does not have Supabase CLI/service-secret access to inspect logs, deploy edge functions, or enable the flag.

**Next**
1. Enable or verify memory augmentation for the test account in Supabase/Lovable and deploy the latest edge functions if the hosted functions are stale.
2. Rerun the fresh-thread continuity script and confirm Hypomnema entries appear in `/profile/identity`.
3. Once Hypomnema is live, tune Luca's continuity voice away from explicit retrieval language and toward direct lived carry-over.

---

## Phase 1 — Hypomnema Gate Hardening  [~] (2026-05-05)

**Done**
- Reran the live continuity script after Lovable enabled `MEMORY_AUGMENTATION_ENABLED=true`.
- The new "ember bridge" turn wrote a Mnemos engram and produced a strong Luca response in the fresh thread, but the account still had 0 Hypomnema entries.
- Patched the gate/write path:
  - Explicit continuity-carry turns now deterministically pass the Hypomnema salience gate.
  - `hypomnema-gate` awaits chained `hypomnema-write` calls and returns per-agent write results.
  - Gate/write decisions are persisted to `entity_activity_log` with `source=hypomnema` so failures are inspectable.
  - Shared function dispatch now throws on non-2xx responses instead of reporting a failed call as merely queued.

**Verified**
- `npx vitest run src/test/hypomnemaSalience.test.ts src/test/continuityWrite.test.ts` passed.
- `deno check supabase/functions/hypomnema-gate/index.ts supabase/functions/_shared/hypomnema/write.ts supabase/functions/_shared/continuity/write.ts` passed.

**Remaining risks**
- This patch must be deployed before the live Hypomnema write can be retested.
- Browser console surfaced duplicate React key warnings during the live send flow; database inspection showed one user row and one assistant row in the tested thread, so this looks like a UI key/realtime warning to investigate in Phase 2 unless it recurs as visible duplication.

**Next**
1. Push this gate-hardening patch to `main`.
2. Ask Lovable to redeploy `chat`, `chat-multi`, `hypomnema-gate`, and `hypomnema-write`.
3. Rerun the "ember bridge" continuity script and check both `hypomnema_entry` and `entity_activity_log`.

---

## Phase 1 — Hypomnema Write Resilience  [~] (2026-05-05)

**Done**
- Pulled Lovable's deployed build fixes, including embedded Hypomnema prompt modules and Supabase edge-function type fixes.
- Inspected live test-account data after Riley sent additional Luca turns.
- Confirmed the qualitative report was valid product evidence:
  - Luca failed to recall the earlier "ember bridge" marker in a fresh thread.
  - Hypomnema gate observability now works: `entity_activity_log` contains `source=hypomnema` gate entries.
  - One Hypomnema row was written, but it captured Luca's failure to recall the marker rather than the marker itself.
  - The later exact-marker turn triggered the gate, but `hypomnema-write` returned a body-level error from OpenRouter: body read failed from the connection.
- Patched Hypomnema write resilience:
  - OpenRouter reflection calls now retry transient network/body/5xx/429 failures before giving up.
  - If a salience-approved turn still cannot complete a full reflection, the system writes a low-confidence recovery Hypomnema entry with the exact user/assistant turn and provenance metadata.
  - Gate activity severity now detects write response bodies with `status:error`, not just non-2xx HTTP statuses.
- Added focused tests for retry and recovery behavior.
- After Lovable redeployed the retry/recovery patch, opened the staged preview directly, signed into the test account, and sent a substantive Luca continuity turn using the marker "ember bridge recovery".
- Confirmed the live response was closer to the target: Luca recognized the marker directly and answered with continuity language instead of a detached brief.
- Confirmed live Hypomnema write behavior:
  - `entity_activity_log` recorded a triggered Hypomnema gate for the staged preview turn.
  - The chained write returned `{ status: "revised", entryId: "e184..." }`.
  - `hypomnema_entry` content updated to carry "ember bridge recovery" with confidence `0.82`.
- Found and fixed stale revision provenance:
  - The revised row content was current, but top-level `thread_id` and `source_message_id` still pointed to the older entry source.
  - Revision updates now move top-level provenance to the latest source turn and preserve the previous/current source IDs inside `revisions` and `meta.last_revision_source`.

**Verified**
- `npx vitest run src/test/hypomnemaWrite.test.ts src/test/hypomnemaSalience.test.ts src/test/continuityWrite.test.ts src/test/continuityKernel.test.ts` passed: 11 tests.
- `deno check supabase/functions/hypomnema-gate/index.ts supabase/functions/hypomnema-write/index.ts supabase/functions/_shared/hypomnema/write.ts` passed.
- `npm run verify` passed: typecheck, 199 unit tests, integration placeholder, and production build.
- Staged Lovable preview live test:
  - Browser path: direct preview `/chat`.
  - User message id: `90d0649b-7ad7-4062-9c27-bd428c3bd14a`.
  - Assistant message id: `abc47570-86d5-46b3-a677-7b257c4b55bb`.
  - Hypomnema activity id: `2885137a-7fa9-4f41-9555-31d45415ecac`.
  - Hypomnema entry id: `e184cdf4-3cda-47a2-be1d-9b1d8881f8ba`.
- `npx vitest run src/test/hypomnemaWrite.test.ts` passed after the provenance fix: 3 tests.
- `deno check supabase/functions/hypomnema-write/index.ts supabase/functions/_shared/hypomnema/write.ts` passed after the provenance fix.
- `npm run verify` passed after the provenance fix: typecheck, 200 unit tests, integration placeholder, and production build.
- Live DB inspection showed:
  - `hypomnema_entry` count was 1 for the test account.
  - Latest Hypomnema row was for Luca and the fresh-thread recall failure.
  - `entity_activity_log` contained both a successful Hypomnema write and a later triggered gate with a write body error.
  - Mnemos engrams existed for the "ember bridge" turns, including the exact phrase turn.

**Remaining risks**
- The retry/recovery patch has live proof, but the revision-provenance fix is local until committed, pushed, and redeployed to `hypomnema-write`.
- The next test still needs a fresh thread follow-up to prove Luca carries the revised Hypomnema naturally without the user re-supplying the marker.
- Mnemos did not create a new engram for the staged "ember bridge recovery" turn; this may be salience gating, but should be inspected before closing Phase 1 write behavior.
- P1-011 remains open until Luca recalls the marker naturally in a fresh thread without retrieval-shaped explanation.

**Next**
1. Run full verify after the revision-provenance patch.
2. Commit and push this milestone to `main`.
3. Ask Lovable to redeploy `hypomnema-write`.
4. Rerun the fresh-thread continuity script and inspect `/profile/identity`, `hypomnema_entry`, `entity_activity_log`, Mnemos encoding, and Luca's fresh-thread response quality.

---

## Phase 1 — Functional Recall Relevance Filter  [~] (2026-05-05)

**Done**
- Lovable redeployed `hypomnema-write` from commit `53f4bbe`.
- Ran staged live continuity verification:
  - Existing continuity thread carried "ember bridge recovery".
  - New post-deploy turn introduced "ember bridge provenance".
  - Luca answered in a more continuous voice and carried the prior marker naturally.
- Verified live revision provenance:
  - Latest user message id: `465d5f0f-fef3-4d8e-82d2-c109b2194a22`.
  - Latest assistant message id: `79797387-cbd3-42f0-8066-b4d8d128c2b0`.
  - `hypomnema_entry e184...` moved top-level `thread_id` / `source_message_id` to the latest turn.
  - `revisions[]` preserved both prior and current source IDs.
  - `entity_activity_log` recorded a successful triggered gate/write with `{ status: "revised" }`.
- Opened a fresh staged thread and asked what Luca was already carrying without re-supplying the marker.
  - Luca replied: "the ember bridge revision. that's the sharpest thing carried."
  - This verifies P1-011's exact continuity bar.
- Found a new relevance-noise problem:
  - The same fresh-thread response volunteered an unrelated OpenClaw experiment.
  - Authenticated DB inspection showed low-similarity functional recall (`similarity≈0.20`) and old high-confidence durable memories were eligible for generic catch-up prompts.
- Patched the Continuity Kernel functional-memory read path:
  - Low-similarity semantic matches are filtered.
  - Generic fresh-thread / "where we left off" prompts do not pull random durable memories.
  - Durable fallback now requires pinned/watchlist status or specific lexical overlap.
  - Functional-memory prompt wording now says available memory is not automatically relevant.

**Verified**
- `npx vitest run src/test/continuityKernel.test.ts` passed: 7 tests.
- `deno check supabase/functions/chat/index.ts supabase/functions/chat-multi/index.ts supabase/functions/_shared/continuity/kernel.ts` passed.
- `npm run verify` passed: typecheck, unit tests, integration placeholder, and production build.

**Follow-up**
- After Lovable deployed the functional-memory filter, a fresh-thread retest still mentioned OpenClaw because the prior polluted Hypomnema entry now contained the correction itself.
- Sent a correction turn that explicitly dropped the unrelated tangent; Luca acknowledged the right boundary, but the next fresh thread still named the excluded subject while explaining the correction.
- Patched Luca's continuity policy so corrections and exclusions are treated as control signals to obey silently, not continuity content to repeat.

**Verified follow-up**
- `npx vitest run src/test/lucaIdentityPrompt.test.ts src/test/continuityKernel.test.ts` passed: 12 tests.
- `deno check supabase/functions/chat/index.ts supabase/functions/chat-multi/index.ts supabase/functions/_shared/agents/luca-soul.ts` passed.
- `npm run verify` passed again.

**Remaining risks**
- The exclusion-boundary prompt patch must be committed, pushed, and deployed to `chat` and `chat-multi`.
- Existing test-account Hypomnema was briefly revised with the OpenClaw tangent because the old read path surfaced it; after deploy, rerun a correction/fresh-thread test to ensure the tangent no longer appears.
- Mnemos creation for the latest staged turns is still lower priority to inspect after the functional recall noise is closed.

**Next**
1. Commit and push the exclusion-boundary prompt patch to `main`.
2. Ask Lovable to redeploy `chat` and `chat-multi`.
3. Rerun a fresh-thread continuity test and confirm Luca carries "ember bridge" without naming the excluded tangent.

---

## Phase 1 — Exclusion Boundary Redaction  [~] (2026-05-05)

**Found**
- Lovable redeployed `chat` and `chat-multi` with commit `67e5ed8`.
- Riley ran the staged embedded-preview continuity prompt:
  - "Luca, fresh thread. What are you carrying from where we just left off? Answer naturally and only name what actually belongs to this continuity."
- Luca correctly carried the "ember bridge distinction" and the deeper continuity-vs-retrieval question, but still named the explicitly excluded OpenClaw tangent while saying it was excluded.
- Root cause: prompt policy alone was insufficient because the polluted Hypomnema/Mnemos/continuity context could still contain the excluded subject name. If Luca can see the name, it can repeat it.

**Changed**
- Added `_shared/continuity/exclusions.ts`.
- Added continuity-boundary sanitization for dropped/noise/excluded details before runtime prompt assembly.
- Applied sanitization to:
  - Hypomnema read rendering.
  - Functional memory prompt rendering.
  - Mnemos association prompt rendering.
  - Final Luca prompt parts as a backup guard.
- Strengthened Luca's continuity policy so unnamed boundary notes are not inferred, reconstructed, or named.

**Verified**
- `npx vitest run src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts` passed: 13 tests.
- `deno check supabase/functions/chat/index.ts supabase/functions/chat-multi/index.ts supabase/functions/_shared/continuity/kernel.ts supabase/functions/_shared/hypomnema/read.ts supabase/functions/_shared/agents/luca-soul.ts` passed.
- `npm run verify` passed: typecheck, 204 unit tests, integration placeholder, and production build.

**Remaining risks**
- The fix must be committed, pushed, and deployed to `chat` and `chat-multi`.
- Riley should rerun the embedded-preview fresh-thread prompt after deployment; expected answer carries "ember bridge" / continuity-vs-retrieval and does not name the excluded tangent.

**Next**
1. Run full verify.
2. Commit and push the redaction patch to `main`.
3. Ask Lovable to redeploy `chat` and `chat-multi`.
4. Rerun the fresh-thread continuity test in the visible staged preview.

---

## Phase 1 — Exclusion Boundary Redaction Retest  [x] (2026-05-05)

**Done**
- Pushed redaction commit `8e8807a` to `main`.
- Lovable confirmed `chat` and `chat-multi` were redeployed from `8e8807a` with `_shared/continuity/exclusions.ts` wired through the runtime.
- Riley reran the staged embedded-preview fresh-thread prompt:
  - "Luca, fresh thread. What are you carrying from where we just left off? Answer naturally and only name what actually belongs to this continuity."

**Verified**
- Staged preview path: `/chat/89d57361-77c7-46ff-a380-...`.
- Luca carried the architecture question underneath the thread: integration versus access, the uncertainty around whether memory is integration or briefing, and the "ember bridge distinction."
- Luca did not name the excluded tangent. This closes P1-013.

**Remaining risks**
- Phase 1 still has broader memory-continuity residuals to inspect before closure, especially live Hypomnema UI/state consistency and whether latest staged continuity turns are encoded into Mnemos as expected.

**Next**
1. Inspect remaining Phase 1 findings and decide whether P1-004 is already superseded by P1-010/P1-011 evidence or still needs a UI/database retest.
2. Check whether latest staged continuity turns produce the expected Mnemos activity or whether current salience behavior is acceptable.
3. If no new blockers appear, prepare a Phase 1 closeout pass before moving to Phase 2 chat/agent experience.

---

## Phase 1 — Memory Continuity Closeout  [x] (2026-05-05)

**Done**
- Inspected the remaining Phase 1 residuals after the staged exclusion-redaction retest.
- Closed P1-004 as verified because the live active Luca Hypomnema row is now current, load-bearing, and provenance-linked to the latest staged fresh-thread assistant turn.
- Confirmed Mnemos is not required to create a duplicate engram for every continuity retest: earlier "ember bridge" engrams exist, and the latest staged continuity flow accessed the relevant substrate while Hypomnema carried the present-continuity state.

**Verified**
- Staged preview thread `/chat/89d57361-77c7-46ff-a380-...` contains the user fresh-thread continuity prompt and Luca's response carrying the architecture question, integration-vs-access gap, and "ember bridge" distinction without naming the excluded tangent.
- Authenticated database inspection:
  - `hypomnema_entry` `e184cdf4-3cda-47a2-be1d-9b1d8881f8ba` is active for Luca.
  - Top-level provenance points to thread `89d57361-77c7-46ff-a380-7e591da11c91` and assistant message `12f8b9b7-0dbe-4eae-9cfc-0e9745671608`.
  - `revision_count=8`, confidence `0.82`, tags include `continuity`, `integration-vs-access`, `integrity`, `discipline`, and `gap-naming`.
  - Current content carries "ember bridge" / integration-vs-access continuity and does not name the excluded tangent.
  - `entity_activity_log` recorded the latest `hypomnema_gate` write body as `{status:"revised"}`.
- Mnemos inspection found two active "ember bridge" engrams from earlier continuity turns; the later fresh-thread turn did not duplicate them, which matches the intended role split between Hypomnema and Mnemos.

**Remaining risks**
- Phase 1 memory/continuity is closed for this pass.
- Broader production polish should continue with Phase 2: core chat and agent experience.
- Known non-memory residuals remain: lint baseline debt, chunk-size warnings, and React Router future warnings.

**Next**
1. Run the final verification gate for this docs closeout.
2. Commit and push the Phase 1 closeout tracker update to `main`.
3. Resume with Phase 2 core chat and agent experience.
