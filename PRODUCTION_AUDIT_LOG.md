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
