# Phase 3 — Backend Reliability

**Goal**: Eliminate silent failures, accidental double-charges, and invisible cron drift across the ~60 edge functions and 13 cron jobs. Make every failure observable and every retry safe.

Phase 3 is purely backend hardening — no UI changes beyond a tiny cron-health badge in Settings → Models. Targeted at "things that break in production but never throw".

---

## 1. Standardized error envelope

**Problem**: Edge functions return inconsistent shapes — some `{ error: "msg" }`, some `{ message }`, some plain strings, some 200-with-error-in-body. Client can't reliably surface them.

**Action**:
- New `supabase/functions/_shared/errors.ts` exporting:
  - `errorResponse(code, message, status, corsHeaders, extra?)` → `{ error, code, request_id }`
  - `wrapHandler(fn)` — catches throws, logs with `request_id`, returns 500 envelope.
  - `ValidationError`, `AuthError`, `RateLimitError`, `UpstreamError` typed classes.
- Migrate the 8 highest-traffic functions first:
  - `chat`, `chat-multi`, `chat-guardian`
  - `anima-tool-execute`, `anima-think`, `anima-dispatch`
  - `memory-extract`, `mnemos-dialectic`
- Client: small util in `src/lib/edgeError.ts` to parse `{ error, code }` for toasts.

## 2. Idempotency on chat send

**Problem**: A double-tap on Send (or a network retry) currently inserts two user messages and bills two model calls. No dedupe.

**Action**:
- New table `public.idempotency_keys (key text pk, user_id uuid, scope text, response_hash text, created_at timestamptz default now())` with TTL of 24h via cron cleanup.
- `chat` and `chat-multi` accept optional `Idempotency-Key` header (client generates `crypto.randomUUID()` per send). If key exists for `(user_id, scope='chat-send')` within TTL → return cached `{ message_id }` short-circuit, no model call.
- Client: `chatStore.sendMessage` generates and passes the key; retries reuse it.

## 3. Cron health surface

**Problem**: 13 pg_cron jobs fire into edge functions; no record of "did the last run succeed". A silently failing decay/dialectic/consolidate job degrades the product invisibly.

**Action**:
- New table `public.cron_health (job_name text pk, last_run_at timestamptz, last_success_at timestamptz, last_error text, last_duration_ms int, run_count int default 0, error_count int default 0)`.
- Shared helper `_shared/cronHealth.ts` exporting `recordCronStart(jobName)` / `recordCronSuccess(jobName, ms)` / `recordCronFailure(jobName, error)`.
- Wire into the 13 cron-targeted functions:
  - `memory-decay`, `memory-reflect`, `memory-synthesize`, `memory-extract`
  - `journal-cron`
  - `mnemos-decay`, `mnemos-soften`, `mnemos-consolidate`, `mnemos-dialectic`
  - `anima-dispatch` (per-target)
  - `luca-pulse`, `luca-initiate`, `observer-watch`
- New page section: Settings → Models → "Background jobs" subsection lists job name, last success, last error (admin only via `has_role('admin')`).

## 4. Unified daily quota helper

**Problem**: Found in Phase 2.5 — `generate-image` enforces 25/day, but `chat`/`chat-multi` enforce nothing. Per project rule we don't add request-rate limiting, but per-user **daily** caps for cost control are in scope.

**Action**:
- New `_shared/dailyQuota.ts` exporting `checkAndIncrement(supabase, userId, scope, limit)` backed by table `public.daily_usage (user_id uuid, scope text, day date, count int, primary key (user_id, scope, day))`.
- Apply scopes:
  - `chat-message`: 500/day (BYOK users) — soft cap, returns 429 with envelope.
  - `image-generation`: 25/day (replaces inline `generate-image` logic).
  - `web-search`: 100/day on `anima-web-search`.
- Single nightly cron prunes rows older than 30 days.

## 5. Upstream resilience (OpenRouter)

**Problem**: OpenRouter 5xx/timeouts surface as raw "Model error (502)" with no retry. A single hiccup kills a streaming reply mid-token.

**Action**:
- `_shared/openrouter.ts` — wrap fetch with:
  - 1 retry on `429`/`502`/`503`/`504` with 500ms jitter (only for non-streaming calls; streaming retries are unsafe mid-stream).
  - Surface `code: "upstream_unavailable"` via the new error envelope.
- Apply to all non-streaming OpenRouter calls: `autoTitleThread`, `extract-persona`, `memory-extract`, `mnemos-dialectic`, `skills-distill`, `crisis classification`.
- Streaming endpoints (`chat`, `chat-multi`) keep their fail-fast behavior but emit a structured `{ type: "error", code: "upstream_unavailable" }` SSE event instead of generic text.

## 6. Webhook/realtime resilience

**Problem**: `chat/index.ts` fires `observer-watch`, `mnemos-dialectic`, `skills-distill` as fire-and-forget; if any throws synchronously before the `fetch`, no record exists.

**Action**:
- Wrap each fan-out in `_shared/safeDispatch.ts` — guarantees logging + cron_health entry under a synthetic `dispatch:<target>` job name.

---

## Files to create

- `supabase/functions/_shared/errors.ts`
- `supabase/functions/_shared/cronHealth.ts`
- `supabase/functions/_shared/dailyQuota.ts`
- `supabase/functions/_shared/openrouter.ts`
- `supabase/functions/_shared/safeDispatch.ts`
- `src/lib/edgeError.ts`
- Migration: `cron_health`, `daily_usage`, `idempotency_keys` tables (+ cleanup cron).

## Edge functions edited (in priority order)

**Tier 1 — chat critical path**
1. `chat`
2. `chat-multi`
3. `chat-guardian`
4. `anima-tool-execute`

**Tier 2 — cron-targeted (cron_health wiring)**
5. `memory-decay`
6. `memory-reflect`
7. `memory-synthesize`
8. `memory-extract`
9. `journal-cron`
10. `mnemos-decay`
11. `mnemos-soften`
12. `mnemos-consolidate`
13. `mnemos-dialectic`
14. `luca-pulse`
15. `luca-initiate`
16. `observer-watch`
17. `anima-dispatch`

**Tier 3 — quota-bearing**
18. `generate-image`
19. `anima-web-search`
20. `anima-image-create`

**Tier 4 — auxiliary OpenRouter consumers**
21. `extract-persona`
22. `skills-distill`
23. `anima-think`, `anima-reflect`, `anima-dream` (error envelope only)

## Out of scope (explicitly deferred)

- True request-rate limiting (per project rules).
- pg_trgm in public schema (Phase 4 data integrity).
- Re-architecting cron to use queues instead of HTTP fan-out.
- Client-side retry UI for failed sends (will land in Phase 7 observability).

## Verification

- Manual: double-click Send → one message inserted, one model call.
- Manual: kill OpenRouter via bad model id → structured `{ error, code: "upstream_unavailable" }` reaches client.
- SQL spot-check `select * from cron_health order by last_run_at desc` after 1 hour → all 13 jobs have entries.
- Linter: no new warnings.
- Audit log: append Phase 3 entry to `PRODUCTION_AUDIT_LOG.md` with what shipped + findings + Phase 4 prep.

**Estimated**: 1 migration, 5 new shared modules, ~20 edge function edits, 1 small admin UI section. ~2-3 hours of focused work.
