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
1. Sweep remaining SECURITY DEFINER fns; REVOKE from anon where not intentionally public.
2. Per-edge-function JWT validation audit on the 52 `verify_jwt = false` functions — confirm each either calls `getClaims()` or is intentionally public (webhooks/cron).
3. CORS allowlist review (`_shared/cors.ts`) — confirm prod origins only.
