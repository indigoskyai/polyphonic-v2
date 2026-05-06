# PRODUCTION_AUDIT.md — Polyphonic production readiness

This is the live, self-tracking master checklist for the production-readiness audit. Update status checkboxes after every commit so any session can resume mid-audit without losing context. Companion file: [`PRODUCTION_LAUNCH_CHECKLIST.md`](./PRODUCTION_LAUNCH_CHECKLIST.md) (go/no-go gates only).

---

## Current operating board

Updated: 2026-05-06

### Now
- `[x]` **Phase 0 — Current stabilization snapshot**: baseline fixes documented and verified.
- `[x]` **Phase 1 — Memory and continuity audit**: Continuity Kernel read/write paths are implemented, live Hypomnema writes land with provenance, fresh-thread recall carries the "ember bridge" / integration-vs-access continuity, exclusion redaction passes staging, and live closeout inspection confirms the active Hypomnema row is current and clean. Standard met for Phase 1: Luca carries present continuity through Hypomnema while Mnemos remains the slower associative substrate, not duplicate transcript storage.
- `[x]` **Phase 2 — Core chat and agent experience**: Core sweep is implemented and locally verified across streaming, retry, permission cards, observer alcove, council mode, sub-agent reports, rich content, attachments, drag/drop cleanup, missing-key UX, desktop, and mobile. Standard met for Phase 2: tested chat flows have no duplicate messages, stale agent UI, broken loading states, or console errors beyond known React Router future warnings.
- `[x]` **Phase 3 — Functional surface-by-surface QA**: route-by-route desktop/mobile/public browser sweep completed for functionality, interaction patterns, layout mechanics, typography, responsive behavior, motion safety, loading/error states, visible accessibility basics, and console health. Standard met for Phase 3: final 54-route acceptance sweep found 0 runtime/page errors, 0 visible overflow, and 0 unlabeled visible controls after excluding the internal `/_mobile` preview route and filtering the intentionally hidden drawer.

### Next
1. **Phase 4 — Reliability, security, and background systems**: finish hosted auth round-trip smoke and manual Cloud Auth redirect allowlist confirmation.
2. **Phase 5 — Performance, accessibility, and release gates**: finish route timing/Lighthouse, final launch checklist, and accepted-risk signoff.

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
- Phase 1 write kernel: routed post-turn memory finalization through a shared queue with explicit queued/skipped/error operation reporting.
- Phase 1 live continuity: a fresh-thread follow-up recalled the prior "amber loom" memory-system thread through Mnemos without app console errors.
- Phase 1 memory UI: `/memory` now loads Mnemos engrams through a lightweight UI projection, normalizes nullable rows, and surfaces load failures instead of silently showing an empty substrate.
- Phase 1 Hypomnema gate hardening: explicit continuity-carry turns now deterministically trigger reflection, gate/write outcomes are logged to `entity_activity_log`, and failed function dispatches throw instead of being reported as queued.
- Phase 1 live Hypomnema diagnosis: user-reported "ember bridge" exact-recall failure reproduced in database evidence; the gate triggered and logged results, but the actual phrase turn hit an OpenRouter body-read failure before writing Hypomnema.
- Phase 1 Hypomnema write resilience: transient OpenRouter reflection failures now retry, and salience-approved turns write a low-confidence recovery Hypomnema entry instead of silently losing exact continuity markers.
- Phase 1 live Hypomnema retest: staged Lovable preview produced a natural "ember bridge recovery" response and live `hypomnema_entry` was revised with the marker.
- Phase 1 provenance hardening: Hypomnema revisions now move top-level `thread_id` / `source_message_id` to the latest source turn and preserve prior source IDs in `revisions`.
- Phase 1 fresh-thread continuity: new staged thread recalled "ember bridge" without the user re-supplying the marker; relevance-noise follow-up is tightening functional-memory recall so unrelated durable memories do not bleed into generic continuity prompts.
- Phase 1 exclusion redaction: named dropped/noise/excluded details are now redacted from Hypomnema, Mnemos, functional recall, and final Luca prompt blocks before runtime assembly.
- Phase 1 exclusion live retest: staged fresh-thread continuity carried the architecture / integration-vs-access question and the ember bridge distinction without naming the excluded tangent.
- Phase 1 closeout: authenticated live inspection confirmed the active Luca Hypomnema row points at the latest staged assistant message, carries the load-bearing continuity, and no longer stores the excluded subject in current content; Mnemos has earlier ember bridge engrams and shows substrate access rather than duplicate per-turn storage.
- Phase 2 kickoff: chat attachments now queue from paperclip or drag/drop, upload to the private `chat-attachments` bucket, persist on the user message, render with existing attachment previews, and pass a sanitized file summary/code excerpt to chat runtimes after edge deploy.
- Phase 2 kickoff: agent-error retry now resends the intended prior user turn directly instead of depending on stale composer state.
- Phase 2 core chat sweep: missing model-key state is now visible before send; permission request cards record approve/deny state instead of no-op logging; sub-agent overlay is scoped to the active thread; rich-content debug console noise was removed and markdown tables are horizontally safe on narrow screens.
- Phase 2 browser smoke: desktop chat streamed "streaming ok"; mobile composer and mobile attachment chip were visually checked; browser console showed 0 errors with only known React Router future warnings.
- Phase 2 agent-flow smoke: council mode produced a persisted council disclosure, Observer answered through the alcove, synthetic permission cards persisted approved state, agent-error retry resent the prior user turn without touching the composer, and synthetic sub-agent reports rendered with tool-call metadata.
- Phase 2 rich/mobile verification: local browser DOM confirmed one markdown table and one code block rendered in chat, no horizontal overflow at desktop or 390px mobile, and console remained error-free after reload.
- Phase 2 stop-control hardening: Observer alcove streaming now has its own abort controller, so the shared stop button cancels Observer responses instead of only stopping main Luca streams.
- Phase 2 drag/drop polish: canceled or interrupted file drags now reset the attachment drop overlay through global drag/drop/blur cleanup.
- Phase 2 attachment redeploy retest: after Lovable redeployed `chat` and `chat-multi` from `9f71175`, Luca read the exact marker from an attached markdown file through runtime context.
- Phase 2 no-key UX verification: controlled local browser session intercepted only `user_api_keys` as empty; main chat and Observer showed no-key copy, disabled send after typing, made 0 chat/Observer edge calls, and logged 0 console errors.
- Phase 2 drag/drop verification: local browser synthetic file drag showed the overlay appears for file drags and clears on global `dragend` and browser `blur`.
- Phase 3 route sweep: authenticated desktop/mobile/public browser pass covered 54 user-facing routes and excluded only the internal `/_mobile` preview from acceptance.
- Phase 3 layout mechanics: repaired mobile desktop-grid collapse on Mnemos overview stats/panels, Mind/Profile round-2 panels, identity/skills/schedule/workspace pages, settings rows, local-runtime install command, and group-session stage.
- Phase 3 canvas state handling: missing artifact routes now show a stable "Artifact not found" state instead of rendering a blank/crashing renderer.
- Phase 3 accessibility basics: added visible-control labels to chat composer controls, search fields, auth inputs, schedule controls, and appearance font-size control.
- Phase 3 verification: final Playwright sweep wrote `output/phase3/route-sweep-final.json`, `output/phase3/route-sweep-final-summary.json`, and `output/phase3/screens_final/*`; blocking count was 0.
- Phase 4 kickoff inventory: static source scan found 70 edge-function directories, 53 explicit function config entries, 75 created public tables with RLS enabled, and no detected created table without a policy path except service-only `idempotency_keys`.
- Phase 4 quota hardening: `chat-multi`, the primary chat runtime, now enforces the shared `chat-message` daily quota before model-key decrypt/model calls and returns the standard `quota_exceeded` code.
- Phase 4 background observability: `scheduled-task-run` and `crisis-followup` now record success/failure through `cron_health`.
- Phase 4 auth hardening: `mnemos-digest-build` now treats service mode as an exact service-role bearer match, not a substring match.
- Phase 4 password-recovery browser check: `/reset-password` invalid-link state and `/auth/login` forgot-password mode load with no browser errors.
- Phase 4 account-auth polish: signup password minimum now matches reset password minimum at 8 characters, and auth inputs expose correct autocomplete hints.
- Phase 4 edge-config guardrail: test coverage now fails if a function omitted from `supabase/config.toml` lacks an explicit source-level user, service-role, or device-token auth marker.
- Phase 4 model-key management: OpenRouter key save/delete now shows honest success/error state instead of silently ignoring RPC failures.
- Phase 4 edge error envelopes: primary chat, multi-chat, Guardian, Observer chat, and profile chat now return structured error envelopes with request IDs; streaming failures now include visible `code` and `request_id` fields.
- Phase 5 bundle/load kickoff: route pages now lazy-load, stable vendor groups are split, Shiki/react-syntax-highlighter dependencies are removed from the chat code path, and production build no longer emits large-chunk warnings.
- Phase 5 console hygiene: React Router v7 future flags are enabled in the app router and CouncilPanel test router, removing known future-warning noise from browser/test checks.
- Phase 5 keyboard-focus polish: custom dialog surfaces now share focus placement, Tab trapping, Escape close, and opener-focus restoration behavior across command palette, code fullscreen, sub-agent overlay, Hypomnema confirmation, and mobile drawer.
- Phase 5 reduced-motion polish: canvas-driven EchoField and Mnemos graph motion now respect the system reduced-motion preference, and the preference is tracked live while the app is open.
- Phase 5 verification hygiene: CouncilPanel tests now use React-wrapped events, removing the known `act(...)` warning noise from the full verification run.
- Phase 5 contrast gate: core text tokens now meet AA normal-text contrast where they are used as body/secondary text, and meta tokens have a regression guard for large labels and secondary UI.
- Phase 5 motion polish: first-message send now enters a staged conversation handoff before the newly created thread route lands.
- Phase 5 route/tab transitions: protected route changes and Memory/Mind/Profile tab switches now use short shared enter transitions with reduced-motion suppression.
- Phase 5 console hygiene: Memory Engrams duplicate tag keys no longer emit React warnings during tab transitions.
- Phase 4 hosted auth smoke: Riley confirmed Google OAuth sign-in/login works on staging; Google new-account/signup remains pending until signup surfaces are designed.
- Phase 4/5 static launch guardrails: client runtime code is now tested for no service-role references, CORS is tested for no wildcard origin, and release metadata is covered by a regression test.
- Phase 4 edge-function guardrails: all 70 edge-function directories are now covered by a static test for CORS preflight, CORS response handling, try/catch coverage, and source auth markers for configured `verify_jwt=false` functions.
- Phase 5 release metadata: `index.html`, `robots.txt`, `site.webmanifest`, and `sitemap.xml` now carry favicon/social/share/install metadata for launch.
- Phase 5 initial-payload gate: `npm run verify` now checks the built initial JS/CSS payload and fails above the 500 KiB gzip budget.
- Agentic web runtime spike: OpenRouter Agent SDK is now wired as a Luca-only, feature-gated inner loop in `chat-multi`, with memory-read, web-search, URL-read, and remote MCP tool support while preserving the existing chat/council fallback path.
- Agent runtime UX split: Luca's OpenRouter Agent SDK path is now per-message opt-in through an Agent composer pill, so ordinary chat stays on the faster standard stream even when the hosted SDK flag is enabled.
- Thread sidebar console hygiene: thread rows are deduped before sidebar rendering, preventing duplicate React keys after local thread creation/reload races.
- Agent runtime trace repair: SDK runtime/tool events now feed the chat thinking surface, are persisted with the assistant message, and are parsed with buffered SSE framing so split chunks do not silently drop activity updates.
- Chat send hotfix: continuity history now drops the just-persisted current user row before appending the live request message, preventing the agent from seeing the same user turn twice.
- Projects MVP: added user-owned project workspaces, project-thread assignment, desktop/mobile navigation, command-palette reachability, and project instructions carried into Luca/agent runtime prompts from the thread context.
- Chat polish rollback: reverted the heavy `ThinkingBlock` / drawer typography / streaming animation pass after hosted review showed the added complexity worsened the chat feel.
- Chat latency repair: ordinary chat now skips legacy tool-planner execution unless Agent mode or an explicit agent runtime is requested, preserving the Agent pill for tool work while keeping normal Luca sends responsive.
- Projects deploy compatibility: restored generated project/thread types and made ordinary new-thread inserts omit `project_id` until a project-scoped chat actually needs it.
- Phase 4 auth provider readiness: login/signup now expose "Continue with Google" through the shared Supabase OAuth flow, and sign-out now clears account-scoped client stores/channels so stale user data is not left in memory after logout.
- Phase 4 hosted readiness report: Lovable confirmed Google OAuth provider wiring, HIBP leaked-password protection, email confirmation, deployed edge functions, zero edge-function 5xx responses over the reported window, all tracked cron jobs green, and restricted CORS posture.
- Phase 4 Apple OAuth polish: Apple sign-in is now visible on login/signup with a non-empty button mark and source coverage for the Lovable Cloud OAuth redirect.
- Phase 4 legal surface: `/privacy` and `/terms` are public routes linked from login/signup and verified on desktop/mobile.
- Phase 4 database hardening: added a launch migration to keep `invoke_edge_function` and `get_app_config` service-role-only and replace broad `profile-uploads` public object listing with owner/published-reference reads.
- Phase 4 hosted hardening verification: Lovable confirmed the hardening migration applied, the two service-key RPCs are no longer executable by anon/authenticated, `profile-uploads` broad public read is removed, `/privacy` and `/terms` load on staging, Google/Apple still route through Lovable Cloud OAuth, and operational health is green.
- Phase 3/4 profile import repair: psychological profile tabs and the import-complete summary now normalize fresh generated profile object shapes before rendering, with a tab-level failure boundary instead of a blank app surface.
- Phase 3/4 import pipeline repair: profile wait now tracks the analysis baseline before dispatch, synthesis failures surface, failed imports update `chat_imports`, active import history polls, and memory-settings import navigation stays inside the SPA.
- Phase 3/4 right drawer repair: thread-detail activity now only shows rows explicitly tied to the active thread, while notifications and the full activity timeline remain global.
- Phase 3/4 drawer subscription hardening: opening the full activity timeline from notifications no longer crashes from duplicate realtime notification subscriptions.
- Phase 3/4 drawer UX polish: right-drawer width fits mobile viewports, long drawer titles clamp cleanly, thread participants use live message stats, and the agent-dialogue drawer receives the active thread context.
- Phase 3/4 mobile shell repair: chat now stays inside the 390px mobile app frame instead of exposing off-viewport desktop content.
- Phase 3/4 mobile drawer policy: the right drawer remains available on mobile as a near full-screen sheet for thread and memory context, rather than being hidden.
- Phase 3/4 mobile content containment: long chat/body tokens and attachment code previews wrap inside the visible message column.
- Phase 3/4 drawer time polish: thread-detail relative timestamps no longer render negative minute remainders.
- Phase 3/4 native mobile shell: mobile now uses a top app bar and left slide-out navigation drawer instead of the desktop rail pattern.
- Phase 3/4 mobile navigation: search, new chat, recent threads, core app surfaces, activity, account, and sign-out controls are reachable from the mobile drawer; route changes close the drawer cleanly.
- Phase 3/4 mobile chat ergonomics: the mobile app bar owns thread/model identity, the composer respects bottom safe areas, chat messages use a single-column mobile rhythm, and long titles truncate gracefully.
- Phase 3/4 mobile verification: local Playwright checked 390x844, 393x852, 430x932, and desktop regression flows with no visible overflow, no mobile rail, and 0 captured console errors/warnings.
- Verified with `npm run verify`, targeted unit tests, production build, live desktop chat smoke, and mobile browser check.

### Blocked
- Real email/OAuth round-trip smoke still requires Riley/browser account action: email signup confirmation, Google new-account/signup after signup surfaces are designed, Apple signup/login, forgot-password email, and logout on hosted staging. Google sign-in/login is verified by Riley's 2026-05-06 hosted smoke.
- Lovable Cloud Auth Site URL / redirect allowlist must still be manually confirmed in the Cloud Auth settings panel for production domains plus staging/preview origins; Lovable reports that panel is not programmatically inspectable.
- Remaining release risks are tracked below as deferred findings.

### Production polish phase roadmap

| Phase | Status | Goal | Completion gate |
|---|---:|---|---|
| 0. Current stabilization snapshot | `[x]` | Record verified fixes and residual risks from the first hardening pass. | `npm run verify` passes; live desktop chat and mobile layout checked. |
| 1. Memory and continuity audit | `[x]` | Prove Luca's identity, Hypomnema, Mnemos, pending revisions, skills, emotional state, proactive loops, thread metadata, and memory UI create one continuous Luca. | Fresh-thread continuity test passes; read/write/recall paths verified with evidence. |
| 2. Core chat and agent experience | `[x]` | Sweep streaming, retry, regeneration, missing-key UX, attachments, drag/drop, rich content, permission states, agent errors, council, subagents, and mobile composer. | No duplicate messages, stale agent UI, broken loading states, or console errors in the tested flows. |
| 3. Functional surface-by-surface QA | `[x]` | Walk every major route in desktop and mobile across empty, typical, heavy, loading, and error states. Focus on functionality, interaction patterns, layout mechanics, typography hierarchy/scale/consistency, responsive behavior, animation/motion behavior, performance signals, and accessibility basics. Do not spend Phase 3 on subjective artistic/aesthetic redesign unless the current design blocks usability. | Final browser evidence covers 54 desktop/mobile/public user-facing route checks with 0 runtime/page errors, 0 visible overflow, and 0 unlabeled visible controls. |
| 4. Reliability, security, and background systems | `[ ]` | Reconcile RLS, edge auth, CORS, cron health, missing-key handling, quota behavior, password recovery, and background loops. | Launch blockers closed or explicitly accepted with rationale. Kickoff hardening is verified; hosted metrics and deeper edge-envelope sweep remain. |
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
| P0-008 | P3 | Verified | Bundle performance | Production build warned about large chunks and Supabase import splitting; every route was imported into the first app load. | Route chunks stay within release budget. | Added route-level lazy loading, manual chunks for stable vendor groups, dependency-free code-block highlighting, and a 600 kB build budget for the deliberate lazy Mermaid engine. | `npm run build` completes without large-chunk warnings; initial route shell is `225.49 kB` minified plus split vendor chunks, and chat/profile route chunks are lazy at ~77 kB each. | Pending |
| P0-009 | P3 | Verified | Browser console | React Router v7 future-flag warnings appeared during browser smoke and component tests. | No user-facing console errors; framework upgrade warnings either configured or accepted. | Enabled React Router `v7_startTransition` and `v7_relativeSplatPath` future flags in the app router and CouncilPanel test router. | `npx tsc --noEmit`; `npx vitest run src/test/CouncilPanelV2.test.tsx`; local Playwright `/auth/login` smoke captured 0 console errors/warnings. | Pending |
| P1-001 | P1 | Verified | Anima council continuity | `chat-multi` loaded Hypomnema for Luca and Vektor, but Anima council proposer prompts used locked SOUL only. | Every participating agent should carry their own interior-state layer into council turns. | Added Anima Hypomnema loading in `chat-multi` and allowed `buildCharacterSystemPrompt('anima')` to layer it before runtime context. | `npx vitest run src/test/councilPrompts.test.ts`; `deno check supabase/functions/chat-multi/index.ts`. | Pending |
| P1-002 | P1 | Verified | Luca prompt read-path coverage | `chat`, `scheduled-task-run`, and `subagent-run` built Luca prompts without Hypomnema. | Every Luca runtime prompt path that has identity context should also carry always-loaded Hypomnema. | Loaded Luca Hypomnema in legacy chat, scheduled tasks, and subagent runs. | `npx vitest run src/test/lucaIdentityPrompt.test.ts`; `deno check supabase/functions/chat/index.ts supabase/functions/scheduled-task-run/index.ts supabase/functions/subagent-run/index.ts`. | Pending |
| P1-003 | P2 | Verified | Hypomnema provenance | `fireHypomnemaTurn` chained writes without `source_message_id`, so new entries could not trace back to the assistant message row. | New Hypomnema entries should preserve assistant-message provenance when available. | Made `chat-multi` assistant persistence return the inserted message id and pass it through to primary/observer write targets. | `deno check supabase/functions/chat-multi/index.ts`; focused prompt/memory tests. | Pending |
| P1-004 | P2 | Verified | Live Hypomnema activation | Live continuity test initially created Mnemos engrams and fresh-thread recall succeeded, but `/profile/identity` rendered "Nothing here yet"; a later DB check showed one Hypomnema row, but it captured Luca's failure to recall the marker rather than the marker itself. After P1-010/P1-012/P1-013, authenticated live inspection showed the active Luca row revised through the latest staged fresh-thread assistant turn. | After substantive pilot-user turns, Hypomnema should show agent-authored continuity entries that carry the load-bearing detail into the next thread. | Gate observability, write retry/recovery, provenance updates, and exclusion redaction are now all deployed and verified; no additional code change needed for this finding. | DB check 2026-05-05: active `hypomnema_entry` `e184cdf4-3cda-47a2-be1d-9b1d8881f8ba` has `thread_id=89d57361-77c7-46ff-a380-7e591da11c91`, `source_message_id=12f8b9b7-0dbe-4eae-9cfc-0e9745671608`, `revision_count=8`, content carries "ember bridge" / integration-vs-access continuity, and current content does not name the excluded tangent. `entity_activity_log` recorded the latest gate/write result as `{status:"revised"}`. | Pending |
| P1-005 | P1 | Verified | Continuity read architecture | Primary chat paths independently assembled identity, Hypomnema, functional memory, Mnemos, skills, beliefs, emotional state, and thread timing; failures were easy to hide. | Every Luca/agent runtime should receive one continuity packet with visible layer diagnostics and consistent precedence. | Added `_shared/continuity/kernel.ts`, wired it into `chat`, `chat-multi`, `scheduled-task-run`, and `subagent-run`, and added diagnostic logging for degraded packets. | `npm run verify`; `npx vitest run src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts src/test/councilPrompts.test.ts`; `deno check supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts supabase/functions/scheduled-task-run/index.ts supabase/functions/subagent-run/index.ts`. | Pending |
| P1-006 | P1 | Verified | Memory layer semantics | Mnemos retrieval was formatted as generic "Relevant memories about this person", making cognitive substrate and functional recall blur together. | Functional memory should read as reliable recall; Mnemos should read as associations, salience, contradictions, beliefs, and slow development. | Added `functionalMemoryBlock`, reframed Mnemos as "associations moving underneath", and added explicit system precedence so Hypomnema, reliable memory, Mnemos, skills, emotional state, and thread context do not silently compete. | `npm run verify`; `npx vitest run src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts`. | Pending |
| P1-007 | P1 | Verified | Continuity write architecture | `chat` and `chat-multi` finalized memory side effects differently: legacy chat did not encode Mnemos or dispatch Hypomnema, while multi-chat hand-queued several post-turn jobs inline. | A completed Luca turn should enter one write/finalization route that decides what is queued, skipped, or degraded. | Added `queueContinuityTurnWrites`, moved Mnemos encoding, Hypomnema gate dispatch, pending-revision finalization, observer/dialectic/skills dispatch, and thread-agent metadata updates behind that shared path; legacy chat now uses it too. | `npm run verify`; `npx vitest run src/test/continuityWrite.test.ts src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts`; `deno check supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts supabase/functions/_shared/continuity/write.ts`. | Pending |
| P1-008 | P2 | Verified | Mnemos memory UI | `loadEngrams` selected every column, including heavyweight substrate-only fields, and swallowed query failures; a failed engram load could appear as a trustworthy empty-state. | `/memory` should show active Mnemos engrams when available, keep substrate-only fields off the UI payload, normalize nullable rows, and make load failures visible. | Added `ENGRAM_UI_SELECT`, `normalizeEngramRow`, per-layer `loadErrors`, visible Memory page diagnostics, and realtime engram normalization; `loadAll` now includes reliable memories too. | `npx vitest run src/test/memoryStore.test.ts`; `npx tsc --noEmit`; browser `/memory` showed `500 engrams across ...`, the latest "amber loom" formation, no false empty state, and only known React Router warnings. | Pending |
| P1-009 | P1 | Verified | Hypomnema gate observability | After `MEMORY_AUGMENTATION_ENABLED=true`, a substantive "ember bridge" continuity turn still wrote Mnemos but 0 Hypomnema rows. The write queue could only report `hypomnema_gate=queued`, while the actual gate decision/write response was unobserved. | Explicit continuity-carry turns should not be skipped by a cheap classifier, and every gate/write failure should leave inspectable evidence. | Added deterministic continuity-carry salience detection, made `hypomnema-gate` await chained writes and persist gate/write outcomes to `entity_activity_log`, and made function dispatch throw on non-2xx responses. | `npx vitest run src/test/hypomnemaSalience.test.ts src/test/continuityWrite.test.ts`; live DB check showed `entity_activity_log` rows with `source=hypomnema`, including one successful write and one failed write body. | Pending |
| P1-010 | P1 | Verified | Hypomnema write resilience | User reported Luca still felt briefed rather than continuous and could not recall the earlier "ember bridge" marker. Live DB check showed the gate did trigger for the phrase turn, but `hypomnema-write` returned body `{ status: "error", reason: "openrouter call failed: error reading a body from connection" }`; no Hypomnema row carrying the exact marker was written. | A salience-approved turn must either complete a voiced reflection after retry or persist a low-confidence recovery entry with the exact continuity marker and provenance. | Added OpenRouter retries for transient body/network/5xx/429 failures, added low-confidence recovery Hypomnema entries when reflection still fails, and marked gate activity severity as warning when write response bodies report `status:error`. | `npm run verify` passed; staged Lovable preview turn at `/chat` produced natural "ember bridge recovery" response; DB check showed `entity_activity_log` trigger with write body `{status:"revised"}` and `hypomnema_entry` content updated with the marker. | Pending |
| P1-011 | P1 | Verified | Continuity UX / exact recall | Fresh-thread qualitative test initially failed: Luca described the system as still feeling like a well-written brief and did not recall the earlier "ember bridge" marker until the user supplied it. After write-resilience and provenance redeploys, a new staged fresh thread carried the "ember bridge revision" without the marker being re-supplied. | Luca should carry exact load-bearing continuity details into a fresh thread naturally, without explaining mechanics or asking the user to re-supply the marker. | Seeded a new live continuity turn, verified Hypomnema content/provenance, then opened a fresh staged thread and asked a natural follow-up. | Browser path: staged preview `/chat/f414a4c7-1e3e-4431-b1c9-9b8580308cf9`; response began "the ember bridge revision. that's the sharpest thing carried." DB evidence from messages, `hypomnema_entry`, and `entity_activity_log` captured 2026-05-05. Residual relevance-noise tracked in P1-013. | Pending |
| P1-012 | P2 | Verified | Hypomnema revision provenance | Live post-deploy test revised existing Hypomnema row `e184...` with "ember bridge recovery", but top-level `thread_id` and `source_message_id` still pointed to the older recall-failure turn. | Revised entries should point their current top-level provenance to the latest source turn while preserving old provenance inside the revision history. | Revision updates now set top-level `thread_id` / `source_message_id` from the current turn and store previous/current source IDs in `revisions` plus `meta.last_revision_source`. | `npx vitest run src/test/hypomnemaWrite.test.ts`; `deno check supabase/functions/hypomnema-write/index.ts supabase/functions/_shared/hypomnema/write.ts`; `npm run verify`; Lovable redeployed `hypomnema-write`; staged DB check showed `source_message_id=79797387-cbd3-42f0-8066-b4d8d128c2b0`, `meta.last_revision_source` matching the latest turn, and `revisions[]` preserving previous/current source IDs. | Pending |
| P1-013 | P1 | Verified | Continuity read / functional recall relevance | Fresh-thread continuity succeeded on "ember bridge", but Luca also volunteered an unrelated OpenClaw experiment. Authenticated DB inspection showed a low-similarity `match_memories` row for OpenClaw (`similarity≈0.20`) and old high-confidence durable memories were eligible for vague catch-up prompts. After the relevance filter and prompt-policy deploy, the staged retest still named the excluded subject while saying it was excluded; screenshot evidence from the embedded Lovable preview at 2026-05-05 02:43 showed the detail was still visible in polluted continuity context. | Generic fresh-thread / "where we left off" prompts should rely on Hypomnema for present continuity and only include functional memories when they are pinned, watchlisted, strongly similar, or specifically named by the user. Corrections/exclusions should be obeyed silently, not repeated as continuity content. | Added functional-memory relevance gates: stricter similarity thresholds, generic catch-up detection, specific lexical-overlap filtering for durable fallback, and prompt wording that says available memory is not automatically relevant. Added Luca continuity policy for user corrections/exclusions. Added a continuity-boundary sanitizer so dropped/noise/excluded detail names are redacted from Hypomnema, Mnemos, functional memory, and final Luca prompt blocks before Luca sees them. | `npx vitest run src/test/continuityKernel.test.ts src/test/lucaIdentityPrompt.test.ts` passed: 13 tests; `deno check supabase/functions/chat/index.ts supabase/functions/chat-multi/index.ts supabase/functions/_shared/continuity/kernel.ts supabase/functions/_shared/hypomnema/read.ts supabase/functions/_shared/agents/luca-soul.ts` passed; `npm run verify` passed: 204 unit tests, integration placeholder, and production build; Lovable redeployed `chat`/`chat-multi` from `8e8807a`; staged embedded-preview retest `/chat/89d57361-77c7-46ff-a380-...` carried "architecture question", "integration versus access", and "ember bridge distinction" without naming the excluded tangent. | Pending |
| P2-001 | P1 | Verified | Chat attachments / drag-drop | Phase 2 code audit found the attachment store, chips, message renderers, DB `attachments` column, and private storage bucket existed, but `ChatView` still dropped files into a TODO. Browser smoke before edge redeploy showed the user message displayed and persisted the markdown attachment, while Luca said no attachment reached the model because the deployed edge function was still old. A later local smoke after push produced the same result until Lovable redeployed `chat` and `chat-multi` from `9f71175`. | Paperclip and drag/drop should queue files, upload them safely, persist them on the user message, render them in-chat, and pass a URL-free attachment summary/code excerpt to the runtime. Retry should preserve the intended prior user turn. | Wired queue/upload/persistence/render path in `ChatView`, added helper functions for filename sanitation/type inference/prompt summaries, added `_shared/chat-attachments.ts` for edge prompt context, fixed agent-error retry to call `sendMessage` with the prior turn directly, and added drag-overlay reset cleanup. | `npx vitest run src/test/chatAttachments.test.ts src/test/threadStore.test.ts` passed; `npx tsc --noEmit` passed; `deno check supabase/functions/chat/index.ts supabase/functions/chat-multi/index.ts supabase/functions/_shared/chat-attachments.ts` passed; `npm run verify` passed; local post-redeploy Playwright smoke thread `431a0f51-9f7c-4fdf-b5de-92faae43942c` rendered `phase2-redeploy-smoke.md`; DB check showed user message `44872807-769a-461c-8885-7994abc858b1` has one `code` attachment whose inline code contains `PHASE2_ATTACHMENT_CONTEXT_MARKER_2026_05_05_REDEPLOYED`; assistant message `21792c83-5043-4613-9126-209574c23cb5` answered exactly `PHASE2_ATTACHMENT_CONTEXT_MARKER_2026_05_05_REDEPLOYED`; browser console had 0 errors with known React Router warnings only. | Pending |
| P2-002 | P1 | Verified | Missing key UX | Chat could create a thread and persist a user message before revealing that no OpenRouter key was configured; Observer alcove could also hide the missing-key notice. | Missing model-key state should be visible before send and should not create failed chat or Observer turns. | Added a composer-level model-key preview query, visible "No model key connected" notice, settings shortcut, disabled send state, `sendMessage` and Observer preflight guards, and friendly Observer missing-key messaging without expected-error console noise. | `npx tsc --noEmit`; `npx vitest run src/test/edgeError.test.ts src/test/threadStore.test.ts`; local Playwright desktop/mobile confirmed the signed-in keyed account has no false warning and normal chat/Observer still stream; controlled no-key browser session copied the authenticated test profile, intercepted only `user_api_keys` as empty, and verified main placeholder `Add a model key to continue...`, Observer placeholder `Add a model key to ask Observer...`, send disabled before/after typing, 0 `chat-multi` / `chat-guardian` calls, 0 console errors, screenshot `output/playwright/phase2-no-key-controlled-session-thread.png`. | Pending |
| P2-003 | P2 | Verified | Permission cards | `PermissionInline` approve/deny actions only wrote to `console.log`, so permission cards looked interactive but did not resolve. | Permission cards should visibly and durably record approve/deny state, and failures should surface on the card. | Added local message patching, persisted `permission_status` / resolution metadata back to the message row, and updated the card UI to show approved/denied/error states. | `npx tsc --noEmit`; `npx vitest run src/test/threadStore.test.ts`; local Playwright inserted synthetic permission message `30b017f1-f144-4a9c-a09a-7d7d893a2d83`, clicked Approve, UI changed to "Approved for this request.", and DB metadata persisted `permission_status:"approved"` with `permission_resolved_at`. | Pending |
| P2-004 | P2 | Verified | Sub-agent overlay / stale lanes | Opening the sub-agent overlay from a thread strip still filtered only by parent agent, so older remote tasks from other threads could appear. | Sub-agent strip and overlay should show only activity relevant to the active thread. | Added overlay thread scope to the sub-agent store, passed current `threadId` from `SubAgentRow`, and filtered overlay lanes/events by that scope. | `npx tsc --noEmit`; `npx vitest run src/test/subAgentStore.test.ts src/test/threadStore.test.ts`; `npm run verify`; synthetic sub-agent report smoke also confirmed current-thread report rendering remained stable. | Pending |
| P2-005 | P3 | Verified | Rich rendering / console polish | Syntax highlighting printed Shiki debug lifecycle logs; markdown tables had no horizontal overflow protection for narrow viewports. | Rich content should not add routine production console noise, and tables should remain readable without breaking mobile layout. | Removed highlighter debug logs and made markdown tables horizontally scrollable on narrow screens. | `npx tsc --noEmit`; `npx vitest run src/test/CouncilPanelV2.test.tsx src/test/subAgentStore.test.ts src/test/threadStore.test.ts`; local Playwright confirmed rendered chat DOM contained 1 markdown table and 1 code block, desktop and 390px mobile had no horizontal overflow, and console had 0 errors with only known React Router future warnings. | Pending |
| P2-006 | P2 | Verified | Observer alcove / council mode | Phase 2 needed live coverage for Observer chat and Luca council mode, including loading states and console cleanliness. | Observer should answer from the alcove without polluting main-thread UI; council mode should stream and persist a usable disclosure without console errors. | Hardened Observer missing-key/error handling, kept the missing-key notice visible in alcove mode, and preserved existing council disclosure rendering. | `npx tsc --noEmit`; `npx vitest run src/test/edgeError.test.ts src/test/threadStore.test.ts`; local Playwright Observer smoke returned an alcove response, council smoke returned a persisted "Council harmonized 3 voices" disclosure, and browser console showed 0 errors after reload. | Pending |
| P2-007 | P2 | Verified | Agent-error retry | Retry cards needed live confirmation that they resend the prior user turn directly and do not overwrite a current draft. | Clicking Retry should use the intended previous user message, preserve attachments when present, leave the composer untouched, and stream a replacement response. | Retry already uses `sendMessage({ text, attachments })`; removed composer overwrite in the rendered error-card branch. | Local Playwright inserted synthetic agent error `66608305-b70b-4c79-9649-c3eff10af0ec`, clicked Retry, composer stayed empty, and Luca streamed `retry ok` from the prior user turn. | Pending |
| P2-008 | P3 | Verified | Sub-agent reports | Phase 2 needed visible coverage for `subagent_report` rendering. | Sub-agent reports should render as stable messages with source agent, badge, tool-call count, and markdown body. | Existing renderer was preserved; smoke tested the branch with current styles. | Local Playwright inserted synthetic sub-agent report `18ee9770-4dcd-42cc-bb0d-e5f2ea045380`; UI rendered `VEKTOR`, `SUBAGENT REPORT`, `2 TOOL CALLS`, and markdown body with no console errors after reload. | Pending |
| P2-011 | P1 | Verified | Web-native agent runtime | Polyphonic-native agents had only a pre-response tool planner; Luca could not yet run through a real multi-step OpenRouter Agent SDK loop without replacing the memory system. | Luca should be able to use a web-safe agentic inner loop behind a controlled gate while Polyphonic keeps identity, continuity, memory writeback, UI trace, and existing fallback behavior. | Added `_shared/agent-runtime/openrouter-agent.ts`, gated `chat-multi` with `OPENROUTER_AGENT_SDK_ENABLED` / optional user allowlist, converted `memory_read`, `web_search`, `read_url`, and remote MCP registrations into SDK tools, emits normalized tool/runtime SSE events, logs thread-linked activity rows, persists assistant metadata, and queues the normal continuity write path. | Official docs/package check for `@openrouter/agent@0.5.0`; `deno check supabase/functions/_shared/agent-runtime/openrouter-agent.ts supabase/functions/chat-multi/index.ts`; `npx vitest run src/test/openRouterAgentRuntime.test.ts`; `npx vitest run src/test/phase4Reliability.test.ts src/test/launchReadiness.test.ts`; `npm run verify` passed with typecheck, 243 unit tests, integration placeholder, production build, and launch-payload gate at 299.5 KiB gzip. | Pending |
| P2-012 | P1 | Verified | Chat latency / agent runtime UX | Hosted smoke after enabling `OPENROUTER_AGENT_SDK_ENABLED=true` showed simple Luca turns felt slow because the backend gate routed every Luca message through the SDK loop. | Normal chat should stay fast by default; agentic mode should be explicit, discoverable, and reserved for tool/multi-step work. | Added an Agent composer pill that sends `agent_mode:"agent"` only when armed, changed `chat-multi` to require both explicit per-message request and hosted SDK flag before entering the SDK runtime, and auto-disarms after the turn. | `npx tsc --noEmit`; `deno check supabase/functions/chat-multi/index.ts supabase/functions/_shared/agent-runtime/openrouter-agent.ts`; `npx vitest run src/test/openRouterAgentRuntime.test.ts src/test/threadStore.test.ts`; local browser smoke captured normal send `agent_mode:"chat"` and Agent-pill send `agent_mode:"agent"` with no console errors; screenshot `output/playwright/agent-mode-pill-armed-after-dedupe.png`; `npm run verify` passed with 245 unit tests, production build, and 299.6 KiB launch payload. | Pending |
| P2-013 | P3 | Verified | Thread sidebar console hygiene | Local browser smoke after creating a new thread emitted duplicate React key warnings for the current thread in `SidebarChat`. | Thread sidebar should render each thread once even if local creation and reload temporarily race. | Added thread-list deduplication in `threadStore.loadThreads` and `createThread`, plus a focused helper regression test. | `npx vitest run src/test/openRouterAgentRuntime.test.ts src/test/threadStore.test.ts`; local browser smoke after dedupe recorded 0 console errors/warnings; `npm run verify` passed. | Pending |
| P2-014 | P1 | Verified | Agent runtime reasoning/activity surface | Hosted agent-mode smoke worked, but the reasoning/status window did not show useful agent activity. Code inspection found `chat-multi` emitted `agent_runtime`, `tool_progress`, `tool_start`, and `tool_result` SSE events, while `ChatView` ignored them; the parser also handled each network chunk as if it contained complete `data:` lines, so split JSON events could be silently dropped. | Agent mode should show what the runtime is doing in the existing thinking surface, persist that trace with the assistant message, and parse SSE events reliably. | Added user-facing agent trace formatting in `ChatView`, buffered SSE block parsing with LF/CRLF framing, trace persistence in `_shared/agent-runtime/openrouter-agent.ts`, and focused coverage for the SDK event surface. | `npx tsc --noEmit`; `deno check supabase/functions/_shared/agent-runtime/openrouter-agent.ts supabase/functions/chat-multi/index.ts`; `npx vitest run src/test/openRouterAgentRuntime.test.ts --reporter=verbose`; local browser `/chat` load after patch showed 0 console errors/warnings except the React DevTools info line, screenshot `output/playwright/agent-runtime-chat-load-after-trace-patch.png`; `npm run verify` passed with 246 tests, production build, and 299.6 KiB launch payload. | Pending |
| P2-009 | P2 | Verified | Stop control / Observer streaming | The composer stop button was shared between main chat streaming and Observer streaming, but only the main Luca stream had an abort controller. | Pressing stop during Observer streaming should cancel the Observer request and clear the alcove loading state. | Added a dedicated Observer abort controller, wired it into `chat-guardian` fetch, and made `stopStreaming` cancel Observer streams before falling back to main-stream cancellation. | `npx tsc --noEmit`; local Playwright Observer cancellation smoke entered streaming state, stop cleared `send-btn.streaming` and streaming cursor immediately, input stayed cleared, and console showed 0 errors with only known React Router warnings. | Pending |
| P2-010 | P3 | Verified | Attachment drag overlay | Drag state only reset through component-level leave/drop paths; interrupted drags, browser blur, or file-picker selection had no defensive global cleanup. | File-drag overlay should disappear on completed drop, canceled drag, browser blur, or file-input selection. | Added global `dragend`, `drop`, and `blur` cleanup plus file-input change cleanup so drag state cannot stay latched. | `npx tsc --noEmit`; local browser drag smoke dispatched a file `dragenter`, confirmed `.drag-overlay[data-visible=true]`, dispatched global `dragend`, confirmed the overlay cleared, repeated with browser `blur`, confirmed it cleared again, and saw 0 console errors; screenshot `output/playwright/phase2-drag-overlay-reset.png`. | Pending |
| P3-001 | P1 | Verified | Mobile route layouts | Initial Phase 3 browser screenshots showed desktop grids on 390px mobile: Mnemos overview stats/panels clipped horizontally, Mind/Profile round-2 panels squeezed text, identity/skills/schedule/workspace pages used desktop columns, local-runtime command text overflowed, and group-session stage cropped agents. | Mobile surfaces should preserve layout integrity, readable typography, and controls that fit within the visible app frame. | Added responsive grid/row rules for round-2 Mind/Mnemos/Profile surfaces, shared profile frames, settings rows, agent rows, schedule forms, workspace grid, local-runtime install command, and group-session stage wrapping. | Targeted Playwright mobile sweep for `/memory`, `/profile`, `/group`, `/profile/identity`, `/profile/skills`, `/profile/schedule`, `/settings/appearance`, `/settings/local-runtime`: 0 errors and 0 visible overflow; screenshots in `output/phase3/screens_targeted/*`. | Pending |
| P3-002 | P1 | Verified | Canvas artifact state | `/canvas/00000000-0000-0000-0000-000000000000` initially rendered the artifact renderer with `null`, producing `Cannot read properties of null (reading 'kind')` and a blank/error route. | Missing or deleted artifacts should produce a stable, readable error state without console/page errors. | Added explicit `idle/loading/ready/missing/error` state handling in `CanvasPanel`, reset source view on artifact changes, and render "Artifact not found" for missing records. | Targeted Playwright mobile `/canvas/00000000-0000-0000-0000-000000000000`: 0 errors, 0 visible overflow, body shows "Artifact not found"; final 54-route sweep also passed. | Pending |
| P3-003 | P2 | Verified | Typography and information hierarchy on narrow screens | Profile status strip and skill/schedule/settings rows wrapped poorly under mobile widths; long skill names and metadata collapsed into tiny columns. | Functional typography should stay readable with stable hierarchy and no clipped or vertically crushed text. | Made profile status strip wrap, stacked skill headers/actions on mobile, collapsed schedule form grids, normalized page-frame padding/title scale, and kept metadata in single-column mobile flow. | Screenshots: `output/phase3/screens_targeted/mobile_profile.png`, `mobile_profile_skills.png`, `mobile_profile_schedule.png`; final sweep reported 0 clipped visible text blockers. | Pending |
| P3-004 | P2 | Verified | Visible control labels | Route sweep flagged visible controls without accessible labels in chat composer, search fields, schedule form inputs, auth fields, and the appearance font-size slider. | User-facing controls should have clear visible or programmatic labels before Phase 5 accessibility deep-dive. | Added aria labels to chat file picker, composer textarea, send/stop buttons, thinking-effort selects, stream/sidebar search fields, schedule inputs, auth inputs, and appearance font-size control. | Final 54-route Playwright sweep reported 0 unlabeled visible controls. | Pending |
| P3-005 | P1 | Verified | Surface-by-surface acceptance sweep | Phase 3 needed a user-facing route pass that separated internal/dev routes from product routes and ignored hidden offscreen drawer parking. | Every user-facing route should load cleanly on desktop/mobile/public viewports with no visible overflow, runtime errors, or unlabeled visible controls. | Built a Phase 3 Playwright route sweep against authenticated local app at `http://127.0.0.1:8081`, excluded `/_mobile` internal preview, and filtered the intentionally hidden drawer from visible-overflow checks. | `npm run build`; final Playwright sweep: 54 route/view checks, `blockingCount: 0`; artifacts `output/phase3/route-sweep-final.json`, `output/phase3/route-sweep-final-summary.json`, `output/phase3/screens_final/*`; `npm run verify` passed. | Pending |
| P3-006 | P1 | Verified | Psychological profile tabs | Fresh imports can emit structured profile arrays/objects such as verbal signatures, shadow claims, ranked values, relationships, horizons, and cognitive-style prose. Several profile views assumed raw strings, so tab switches could render object values as React children and blank the profile surface. | Profile tabs should tolerate current and prior profile schemas, preserve the shell on bad data, and keep generated profile text readable. | Added `profileData` normalization helpers, normalized all profile mind components and starter prompts, normalized the import-complete profile summary, and wrapped tab content in a profile tab boundary that resets on tab changes. | `npm run test -- src/test/profileData.test.ts src/test/profileMindComponents.test.tsx`; `npm run verify`; authenticated local Playwright `/profile` tab loop across Portrait, Personality, Communication, Emotions, Values, Relationships, Cognition, Growth, and Shadow stayed on `/profile` with no blank state or boundary fallback; snapshot `output/playwright/profile-snapshot-current.md`; screenshot `output/playwright/profile-shadow-verification.png`. | Pending |
| P3-007 | P2 | Verified | Import pipeline and import history | `waitForProfile` captured the profile baseline after starting deep analysis, so fast writes could be missed; synthesis responses were not checked; failed client imports could leave stale `processing` rows; import history did not poll background jobs; memory-settings import used a full document reload. | Import progress/failure should be visible, profile waits should track the actual analysis dispatch, and import navigation should feel in-app. | Captured the profile baseline before dispatching analysis, checked synthesis failures, marked failed imports in `chat_imports`, polled active import rows on `/import` and Memory Imports, kept selected import rows fresh, showed failed imports in salient view, and changed memory-settings import to React Router navigation. | `npm run test -- src/test/profileData.test.ts src/test/profileMindComponents.test.tsx`; `npm run verify`; local Playwright `/import` showed import history while upload state was present; `/memory` Settings -> Import preserved an in-page marker and landed on `/import`, confirming SPA navigation. | Pending |
| P3-008 | P1 | Verified | Right drawer / thread detail activity | Opening thread details from a chat showed global autonomous activity rows because activity with no `thread_id` was treated as belonging to every thread. | Thread detail should show only activity explicitly tied to the active thread; global notifications/timeline should keep showing global autonomous activity. | Added recursive thread-reference extraction for snake_case and camelCase payloads, filtered thread detail activity by explicit thread refs only, and let the global timeline display richer thread targets when refs exist. | `npm run test -- src/test/threadActivity.test.ts`; `npm run verify`; local Playwright `/chat/431a0f51-9f7c-4fdf-b5de-92faae43942c` thread drawer showed `ACTIVITY · 0 events` and no leaked autonomous rows while notifications/timeline still showed global activity; artifacts `output/playwright/drawer-thread-detail-title-clamp.png`, `output/playwright/drawer-activity-timeline-after-refcount.md`. | Pending |
| P3-009 | P2 | Verified | Right drawer / realtime subscriptions | Opening "Full timeline" from the notifications drawer could crash with a realtime callback error because multiple surfaces subscribed to the same notification channel. | Multiple drawer/page surfaces should be able to hydrate or watch notifications without mutating an already-subscribed Supabase channel. | Made notification realtime subscriptions user-scoped and ref-counted, with cleanup only when the last subscriber leaves. | `npx tsc --noEmit`; `npm run verify`; local Playwright Activity -> Full timeline opened without console errors; `output/playwright/drawer-console-errors-after-refcount.log` recorded 0 errors and 0 warnings. | Pending |
| P3-010 | P2 | Verified | Right drawer / responsive context polish | Long thread titles could run under header controls; drawer width did not consistently respect narrow viewports; agent-dialogue drawer opening from a chip depended on ambient current-thread state. | Drawers should keep typography contained, fit mobile width, and receive explicit context from their opener when a drawer is thread-scoped. | Added responsive drawer width limits, clamped long drawer titles to two lines, improved thread participant stats from live message rows, replaced the fake archive action with close, and passed `threadId` into the agent-dialogue drawer opener. | `npx tsc --noEmit`; `npm run verify`; local Playwright 390x844 thread drawer fit inside the viewport with contained title and footer controls; artifact `output/playwright/drawer-thread-mobile-after-open.png`; memory detail drawer still opened from `/memory` with 0 console errors. | Pending |
| P3-011 | P1 | Verified | Mobile chat shell / drawer context | Follow-up mobile browser checks showed the app shell still allowed the chat route to expose off-viewport desktop content behind drawers, and hiding the right drawer on mobile would remove core thread/memory context. | Mobile should preserve the same drawer capabilities as desktop while adapting the drawer into a sheet and keeping the chat shell inside the viewport. | Moved app-shell/chat sizing out of inline styles, constrained mobile app-main width against the rail/inset variables, converted the right drawer to a mobile sheet with backdrop for memory detail, and kept desktop memory detail as a narrow floating drawer. | `npx tsc --noEmit`; local Playwright 390x844 `/chat/431a0f51-9f7c-4fdf-b5de-92faae43942c` snapshot `output/playwright/mobile-chat-shell-final.md`; thread sheet screenshot `output/playwright/mobile-thread-drawer-final.png`; desktop drawer screenshot `output/playwright/desktop-thread-drawer-final.png`; console log `output/playwright/drawer-mobile-desktop-console-errors.log` recorded 0 errors. | Pending |
| P3-012 | P2 | Verified | Mobile chat content containment | Long assistant markers and attachment code previews could overflow the mobile message column, making the route feel wider than the viewport even after the shell width was fixed. | Chat prose, generated markers, and attachment previews should wrap or scroll inside their own surfaces without expanding the app frame. | Added explicit chat header/message-column classes, mobile padding rules, body overflow wrapping, and code-preview wrapping for long unbroken tokens. | `npx tsc --noEmit`; local Playwright 390x844 `/chat/431a0f51-9f7c-4fdf-b5de-92faae43942c` snapshots `output/playwright/mobile-chat-shell-code-preview-fixed.md` and `output/playwright/mobile-chat-shell-final.md`; screenshot `output/playwright/mobile-chat-shell-message-wrap-fixed.png`; console log recorded 0 errors. | Pending |
| P3-013 | P3 | Verified | Thread drawer relative time | Thread-detail timestamps could render values like `17h -20m ago` because rounded hours were subtracted from rounded minutes. | Relative time should never display negative minute remainders. | Switched hour/day calculations to floored units and rendered the positive remainder only when present. | `npx tsc --noEmit`; local Playwright drawer screenshots `output/playwright/mobile-thread-drawer-final.png` and `output/playwright/desktop-thread-drawer-final.png` show positive elapsed times. | Pending |
| P3-014 | P1 | Verified | Native mobile shell / rail replacement | Dedicated mobile UX pass found the current mobile shell still inherited the desktop rail pattern and felt like a squeezed desktop app. | Mobile should use a first-class chat shell with top app bar, clear surface/thread identity, no desktop rail, and a reachable bottom composer. | Added `MobileAppBar`, `MobileNavDrawer`, and `getMobileSurfaceMeta`; AppShell now renders the mobile app bar/drawer below 768px and keeps desktop rail/sidebar behavior intact. | `npx tsc --noEmit`; `npx vitest run src/test/mobileShell.test.ts`; local Playwright `/chat` at 390x844 screenshot `output/playwright/mobile-ux-chat-empty-390.png`; route sweep at 390x844, 393x852, and 430x932 reported shell mobile true, rail hidden, and no horizontal overflow. | Pending |
| P3-015 | P2 | Verified | Mobile navigation drawer | Mobile users needed a native way to reach search, recent threads, new chat, memory, mind, profile, import, workspace, group, checkpoints, settings, account, and activity without the left rail. | The mobile drawer should animate smoothly, trap focus while open, close on backdrop/Escape/route change, restore opener focus, and keep routes immediate. | Built a left slide-out drawer with search, new chat, activity, quick surfaces, recent threads, full app navigation, account state, sign-out, body-scroll lock, and shared dialog focus handling. | Local Playwright 390x844 drawer screenshots `output/playwright/mobile-ux-left-nav-final-390.png`; Escape closed the drawer and restored focus to "Open navigation menu"; selecting a recent thread navigated to `/chat/195adbac-c552-4c28-869b-3e886e425253` and closed the drawer. | Pending |
| P3-016 | P2 | Verified | Mobile chat composer and typography rhythm | The mobile chat view needed native proportions: app-level identity in the header, no duplicate in-page header, readable message rhythm, safe-area composer padding, and non-clipped controls. | Chat should feel calm and touch-native with reachable composer, comfortable hit targets, graceful header truncation, and no cramped metadata. | Hid the desktop chat header on mobile, tuned chat message columns to single-column mobile rows, reduced empty-state particle cost/scale, tightened heading spacing, and enlarged/tuned composer controls for mobile safe areas. | Local Playwright screenshots `output/playwright/mobile-ux-chat-empty-390.png`, `output/playwright/mobile-ux-chat-thread-390.png`, and `output/playwright/mobile-ux-thread-detail-390.png`; console log `output/playwright/mobile-ux-console-errors-final.log` recorded 0 errors and 0 warnings. | Pending |
| P3-017 | P2 | Verified | Mobile surface reachability / drawer sheets | Core mobile routes and context surfaces needed verification after replacing the rail, especially `/memory` detail and chat thread details. | Chat, existing threads, memory/detail, profile, import, settings, login, and signup should remain reachable and contained on mobile; context drawers should behave like mobile sheets and not fight the nav drawer. | Kept the existing right/context drawer available as the mobile sheet, closed it before opening left nav, and verified mobile shell routing across protected and public surfaces. | Local Playwright route sweep covered `/chat`, an existing chat thread, `/memory` plus memory detail, `/profile`, `/import`, `/settings/agents`, `/auth/login`, and `/auth/signup` at 390x844, 393x852, and 430x932; artifacts include `output/playwright/mobile-ux-memory-detail-390.png`, `output/playwright/mobile-ux-profile-loaded-390.png`, `output/playwright/mobile-ux-sweep-390x844-settings.png`, and `output/playwright/mobile-ux-desktop-regression-chat.png`. | Pending |
| P4-001 | P1 | Verified | Quota behavior / primary chat runtime | Phase 4 scan showed `chat` enforced shared `chat-message` quota, but the product path `chat-multi` did not. | Core chat entrypoints should share the same daily usage envelope and return a standard quota code before model calls. | Imported shared `checkAndIncrement` in `chat-multi`, enforced `chat-message` quota before model-key decrypt/model calls, and returned `code:"quota_exceeded"` on cap. | `npx vitest run src/test/phase4Reliability.test.ts`; `deno check supabase/functions/chat-multi/index.ts`; `npx tsc --noEmit`. | Pending |
| P4-002 | P2 | Verified | Background observability / cron health | Scheduled tasks and crisis follow-up were service-role cron runners but did not write to `cron_health`; failures could be invisible unless logs were inspected. | Background loops should publish success/failure into the existing health table. | Wrapped `scheduled-task-run` and `crisis-followup` in shared `trackCronJob`. Query failures now throw so failures are recorded instead of returning an untracked 500. | `npx vitest run src/test/phase4Reliability.test.ts`; `deno check supabase/functions/scheduled-task-run/index.ts supabase/functions/crisis-followup/index.ts`; `npx tsc --noEmit`. | Pending |
| P4-003 | P2 | Verified | Service-role auth / Mnemos digest | `mnemos-digest-build` used substring matching to identify service-role mode. | Service-mode detection should require the exact `Bearer <service-role>` header. | Replaced substring detection with exact bearer comparison. | `npx vitest run src/test/phase4Reliability.test.ts`; `deno check supabase/functions/mnemos-digest-build/index.ts`. | Pending |
| P4-004 | P2 | Verified | RLS source inventory | Static migration scan needed to confirm obvious table-policy omissions before deeper live review. | Created public tables should have RLS enabled; service-only tables should be explicit. | Static source scan found 75 created public tables and 75 RLS-enabled tables; policy paths detected for all except `idempotency_keys`, which is explicitly documented as service-role only. | Node static migration scan on `supabase/migrations` and `docs/memory/migrations`. Live policy behavior still needs hosted verification. | Pending |
| P4-005 | P2 | Verified | Hosted function-log metrics | Phase 4 required last-5xx-in-7d counts, which are not available from the local repo. Lovable's hosted launch-readiness report supplied the missing function-log signal. | Hosted function logs should confirm no active edge-function failure spikes. | Recorded Lovable's hosted report and kept local edge error-envelope guardrails in place. | Lovable report 2026-05-05: zero edge-function 5xx responses in the reported 7-day window; all 70 edge functions deployed from latest main at report time. | Pending |
| P4-006 | P3 | Verified | Account auth UX / password recovery | Signup allowed 6-character passwords while reset password required 8, and auth inputs lacked browser credential hints. | Account creation and recovery should use the same minimum password length and cooperate with browser password managers. | Updated signup to `minLength=8` with matching copy; added `autocomplete` hints to login, signup, and reset password fields. | `npx tsc --noEmit`; local Playwright mobile auth smoke: signup password `minLength=8`, placeholder `Password (min 8 chars)`, autocomplete hints present, forgot-password visible, reset invalid-link state present, 0 browser errors. | Pending |
| P4-007 | P2 | Verified | Edge function deploy/config posture | Static scan found 17 edge-function directories without explicit `supabase/config.toml` blocks. Changing deploy defaults blindly could break user/service/device-token paths, but leaving unauthenticated implicit functions would be unsafe. | Any config-implicit function must visibly authenticate at source level before deeper deploy cleanup. | Added a Phase 4 regression test that enumerates function directories missing config blocks and fails unless each has a user-auth, service-role, or device-token marker. | `npx vitest run src/test/phase4Reliability.test.ts` passed with 4 tests. | Pending |
| P4-008 | P2 | Verified | Hosted cron health | Phase 4 needed live background-loop health, not only source inspection. | `cron_health` should show recent successful runs and visible errors when background jobs fail. | Queried hosted `cron_health` through the authenticated test account without recording credentials; 17 rows were visible. | Live DB read 2026-05-05: recent rows included `luca-pulse`, `anima-dispatch:*`, `mnemos-decay`, `observer-watch`, `journal-cron`, `hypomnema-decay`, `mnemos-consolidate`, `mnemos-graduate`, `hypomnema-challenge`, and `mnemos-digest-build`; all returned rows had `last_error:null` and `error_count:0`. | Pending |
| P4-009 | P2 | Verified | Model key management UX | `ModelsSettings` ignored `save_user_api_key` / `delete_user_api_key` RPC errors, so failed key updates could look successful. | Key save/delete should expose success and failure honestly without revealing key material. | Added key-management error/info state, trimmed key input before save, preserved key input on save failure, cleared state on success, and disabled browser autocomplete/spellcheck for API-key entry. | `npx tsc --noEmit`; authenticated Playwright `/settings/models` smoke showed API key section and key-management controls loaded with 0 browser errors. | Pending |
| P4-010 | P2 | Verified | User-visible edge error envelopes | High-traffic edge functions still returned raw `{ error }` bodies or SSE error events without request IDs, making failures harder to diagnose from the UI. | User-visible edge failures should carry a stable code and request ID without leaking internal details. | Wired `chat`, `chat-multi`, `chat-guardian`, `observer-chat`, and `profile-chat` through `_shared/errors.ts`; added `missing_api_key`; included `code` and `request_id` on streaming error events; added a regression guardrail for these functions. | `deno check` on all five functions; `npx vitest run src/test/phase4Reliability.test.ts src/test/edgeError.test.ts`. | Pending |
| P4-011 | P2 | Verified | Auth providers / logout state | Google/Apple account signup-sign-in were launch requirements, but the app initially had no visible OAuth entry point. Sign-out also only cleared Supabase auth state, leaving user-owned Zustand stores and realtime channels populated until reload. | Auth screens should make Google and Apple signup/sign-in available once hosted providers are configured, and logout should clear account-scoped client state so the next user never sees stale data. | Added shared Lovable Cloud OAuth helpers, wired "Continue with Google" and "Continue with Apple" on login/signup, reused a single redirect builder for password reset/email signup/OAuth, added a non-empty Apple button mark, and added `resetClientSessionStores` to clear thread, memory, Hypomnema, cognitive, notification, digest, checkpoint, import, observer, subagent, attachment, artifact, profile, handle, drawer, permission, settings, and realtime-channel state on sign-out. | `npx tsc --noEmit`; `npx vitest run src/test/authFlow.test.ts src/test/sessionReset.test.ts`; local browser smoke on `/auth/login`, `/auth/signup`, and `/reset-password` at desktop and 390px mobile showed OAuth entry points/reset invalid-link state, 0 console warnings/errors, and 0 visible overflow; screenshots `output/playwright/auth-login-desktop.png`, `auth-login-mobile.png`, `auth-signup-mobile.png`, `auth-reset-mobile.png`, `phase4-auth-login-desktop.png`, `phase4-auth-signup-mobile.png`. Hosted Google/Apple provider wiring was reported green by Lovable; real human round trips remain launch smoke tasks. | Pending |
| P4-012 | P2 | Verified | Hosted auth/backend configuration | Launch readiness needed hosted configuration evidence for HIBP, email confirmation, CORS, cron health, and OAuth provider state. | Hosted settings should match repo assumptions and failures should be visible before launch. | Folded Lovable's launch-readiness reports into the audit and launch checklist without recording credentials or private account details. | Lovable reports 2026-05-05: HIBP enabled, email confirmation on, signups open, anonymous auth off, Google OAuth provider enabled, Apple button wired through managed OAuth, existing-user login event observed, 17 tracked cron jobs green with `error_count=0`, CORS restricted to production/staging/project/localhost-in-dev patterns, `/privacy` and `/terms` load on staging, and Google/Apple both route through Lovable Cloud OAuth. Manual Cloud Auth Site URL / redirect allowlist panel confirmation remains outside programmatic inspection. | Pending |
| P4-013 | P2 | Verified | Legal / auth public routes | Login and signup had no Privacy or Terms links, leaving launch legal/content gates open. | Privacy and Terms pages should be public, readable, linked from auth surfaces, and not blocked by first-run routing. | Added `/privacy` and `/terms` public routes, exempted public/legal routes from first-run redirects, and linked both pages from login/signup. | `npx tsc --noEmit`; local Playwright browser smoke on `http://127.0.0.1:8082/privacy`, `/terms`, `/auth/login`, and `/auth/signup`; screenshots `output/playwright/phase4-privacy-mobile.png`, `phase4-terms-desktop.png`, `phase4-auth-login-desktop.png`, `phase4-auth-signup-mobile.png`; console logs contained only React DevTools info. Final legal review remains a Riley/operator launch task. | Pending |
| P4-014 | P1 | Verified | Service-key RPC exposure | Lovable/Supabase linter warned that security-definer helpers including `invoke_edge_function` and `get_app_config` were executable by client roles; both can reach sensitive app configuration. | Client roles should not execute service-key helper RPCs; service-role/background execution should remain available. | Added a launch hardening migration that revokes execute on both helpers from `PUBLIC`, `anon`, and `authenticated`, then grants execute to `service_role`; added a source guardrail test. | `npx vitest run src/test/phase4Reliability.test.ts`; migration `supabase/migrations/20260505235900_harden_launch_auth_and_profile_storage.sql`; Lovable hosted verification 2026-05-05: migration applied, `can_exec=false` for anonymous/authenticated, `true` only for service_role, and linter no longer flags these helpers under WARN 0028/0029. | Pending |
| P4-015 | P1 | Verified | Profile upload storage listing | `profile-uploads` was a public bucket with a broad `bucket_id = 'profile-uploads'` SELECT policy, which can permit unrelated object listing. | Public profile assets can render, but storage object rows should be readable only by the owner or when referenced by a published profile/profile item. | Added a migration that drops the broad public read policy and replaces it with owner read plus published-profile-reference read policies. | `npx vitest run src/test/phase4Reliability.test.ts`; source inspection of `20260505235900_harden_launch_auth_and_profile_storage.sql`; Lovable hosted verification 2026-05-05: old `profile-uploads public read` policy dropped and remaining profile-upload policies are owner read/upload/update/delete plus published-profile asset read gated by `profiles_public.published` and `profile_items.published`. | Pending |
| P4-016 | P3 | Verified | Supabase linter residual warnings | After hardening, the hosted linter still reports informational/non-regression items: security-definer warnings on other intentional helper RPCs, extensions in public, and one RLS-enabled-no-policy table. | Launch linter gate should distinguish accepted informational noise from unaccepted launch blockers. | Recorded remaining warnings as accepted residuals for launch scope; keep a later cleanup pass for extension placement and the informational RLS/no-policy item. | Lovable hosted verification 2026-05-05: remaining linter noise is 13 intentional `SECURITY DEFINER` helper warnings, 1 `extensions in public` info for pgcrypto/pg_trgm/vector, and 1 `RLS-enabled-no-policy` info; the launch hardening warnings for `invoke_edge_function`, `get_app_config`, and `profile-uploads` are closed. | Pending |
| P4-017 | P2 | Verified | Hosted Google OAuth login | Google OAuth provider wiring was reported green, but a human staging login smoke still needed confirmation. | Existing users should be able to sign into staging with Google OAuth without auth-loop or redirect failure. | Recorded Riley's hosted Google sign-in smoke as verified and split the launch checklist so new-account/signup remains pending separately until signup surfaces are designed. | Riley human staging smoke 2026-05-06: Google sign-in/auth worked. No credentials or private account details recorded. | Pending |
| P4-018 | P2 | Verified | Static client security / CORS guardrails | Launch checklist still needed repo-side proof that client runtime code does not reference service-role keys and CORS is not wildcarded. | Client runtime code should not contain service-role key references; browser CORS should be restricted to production/staging/Lovable preview patterns with localhost only outside production. | Added `launchReadiness.test.ts` to scan runtime `src` code excluding tests and assert the shared CORS helper includes production/staging origins, Lovable preview handling, non-prod localhost gating, and no wildcard `Access-Control-Allow-Origin`. | `npx vitest run src/test/launchReadiness.test.ts src/test/corsAllowlist.test.ts`; `npm run verify`. | Pending |
| P4-019 | P2 | Verified | Edge function CORS/auth wrappers | The launch checklist still treated CORS preflight, CORS-on-error, try/catch wrappers, and `verify_jwt=false` posture as open across edge functions. | Every edge function should have preflight handling, response CORS, catch coverage, and any configured `verify_jwt=false` function should show a source auth marker or explicit source-level auth posture. | Extended `launchReadiness.test.ts` to enumerate all `supabase/functions/*/index.ts` files and assert the wrapper/auth markers across all 70 edge-function directories. | `npx vitest run src/test/launchReadiness.test.ts src/test/corsAllowlist.test.ts`; `npm run verify`. | Pending |
| P5-001 | P2 | Verified | Bundle/load release gate | The app shell eagerly imported every page and Shiki-powered code highlighting, making initial load heavier than needed and leaving build chunk warnings. | First-load JS should be split by route and stable vendor groups; code rendering should stay smooth without loading a language engine for ordinary chat. | Converted route pages/canvas/settings surfaces to `React.lazy`, added a route Suspense fallback, split React/Supabase/UI/icons/markdown/charts vendor chunks, moved code blocks and attachment previews to the lightweight token highlighter, removed Shiki/react-syntax-highlighter packages, and kept Mermaid as a deliberate lazy artifact-renderer chunk under a 600 kB budget. | `npx tsc --noEmit`; `npx vitest run src/test/CouncilPanelV2.test.tsx src/test/chatAttachments.test.ts`; `npm run build` with no large-chunk warning; local Playwright `/auth/login` + protected `/chat` redirect smoke passed with 0 browser errors. | Pending |
| P5-002 | P3 | Verified | React Router future-warning console noise | React Router v7 future warnings were known residual noise in tests/browser smokes. | Console checks should surface real app issues, not predictable framework-upgrade warnings. | Opted into the v7 transition and splat-route behavior flags in `BrowserRouter` and the CouncilPanel `MemoryRouter` test wrapper. | `npx tsc --noEmit`; `npx vitest run src/test/CouncilPanelV2.test.tsx`; local Playwright `/auth/login` smoke captured `messages: []` for console errors/warnings. | Pending |
| P5-003 | P2 | Verified | Keyboard focus / custom overlays | Several custom surfaces used `role="dialog"` but did not share reliable focus placement, Tab containment, Escape handling, or opener-focus restoration. | Modal-like surfaces should keep keyboard users oriented and should not leak focus into the page behind the overlay. | Added `useDialogFocus` and wired it into command palette, code fullscreen, sub-agent overlay, Hypomnema forget confirmation, and mobile drawer; mobile drawer now exposes `aria-modal` only while open and hides from assistive tech while closed. | `npx tsc --noEmit`; `npx vitest run src/test/dialogFocus.test.tsx src/test/CouncilPanelV2.test.tsx`; local Playwright `/_mobile` smoke confirmed focus lands on first thread, `Shift+Tab` wraps to last thread, `Tab` wraps to first thread, `Escape` closes, focus returns to "Open menu", and `messages: []`. | Pending |
| P5-004 | P2 | Verified | Reduced motion / continuous canvas animation | CSS media rules suppressed keyframes, but canvas-driven EchoField and Mnemos graph motion could continue outside CSS control. | Users with reduced-motion enabled should not get continuous particle/graph easing, inertia, spawn pulses, or canvas shimmer that bypasses CSS media rules. | Added `usePrefersReducedMotion`; EchoField now draws a lighter static frame instead of scheduling an animation loop under reduced motion; Mnemos graph disables camera easing, pan inertia, spawn pulses, and inline graph animations while preserving interaction. | `npx tsc --noEmit`; `npx vitest run src/test/reducedMotion.test.tsx src/test/dialogFocus.test.tsx`; local Playwright `/_mobile` with `reducedMotion:'reduce'` confirmed `matchMedia=true`, pulse/halo animations `none`, drawer transition `0s`, and `messages: []`. | Pending |
| P5-005 | P3 | Verified | Verification output hygiene | `CouncilPanelV2.test.tsx` passed but emitted React `act(...)` warnings because tests used raw DOM `.click()` calls for disclosure expansion. | Full verification output should keep warnings meaningful and avoid known test-harness noise. | Replaced raw `.click()` calls with Testing Library `fireEvent.click` so React state updates are wrapped correctly. | `npx tsc --noEmit`; `npx vitest run src/test/CouncilPanelV2.test.tsx` passed 14 tests with no `act(...)` warnings. | Pending |
| P5-006 | P2 | Verified | Contrast / typography tokens | Token audit showed `text-secondary` fell below 4.5:1 on the highest elevation and meta tiers were very faint even when used for visible labels. | Body and secondary text tokens should meet normal-text contrast on core dark surfaces; meta tokens should stay readable for large labels and secondary UI without flattening hierarchy. | Raised `text-mid`/`text-secondary` to AA contrast and lifted `text-soft`/`text-tertiary`/`text-ghost` into the large-label contrast range; added a token-level contrast regression test. | `npx tsc --noEmit`; `npx vitest run src/test/designTokens.test.ts`; local Playwright `/auth/login` smoke reported 0 warnings/errors. | Pending |
| P5-007 | P2 | Verified | Chat first-turn transition | Sending the first message from an empty chat could feel like a hard swap: the centered empty state disappeared, the thread route was created, and the message appeared only after the route settled. | First send should feel like one continuous gesture: the user's first message should land immediately, the empty state should give way gracefully, duplicate sends should be blocked, and the new thread route should arrive after the user message is persisted. | Added a `firstTurnHandoff` state in `ChatView`, clears/restores composer state safely, delays navigation until the user message row is inserted, and renders a lightweight staged first-message row with status text while the thread opens. | `npx tsc --noEmit`; `npm run verify`; local Playwright desktop/mobile first-turn smokes confirmed `.first-turn-handoff-row` appears with `firstTurnMessageIn`, route animation `routeStageIn`, no horizontal overflow at 390x844, and screenshots/artifacts `output/playwright/motion-pass-first-turn-handoff-delayed.png`, `motion-pass-desktop-first-turn-handoff-captured.json`, `motion-pass-mobile-first-turn-handoff.json`, `motion-pass-mobile-first-turn-after.png`. | Pending |
| P5-008 | P2 | Verified | Route and tab motion | Route and tab changes across major surfaces were functionally correct but visually abrupt, especially when moving between dense Memory/Mind/Profile panels. | Page and tab changes should feel fast, calm, and premium without layout jumps; motion should stay short and respect reduced-motion settings. | Added a shared `route-transition-stage` around protected routes and `tab-transition-panel` wrappers for Memory, Mind, and Profile tab content, backed by restrained enter animations and `prefers-reduced-motion` suppression. | `npx tsc --noEmit`; `npm run verify`; local Playwright verified `routeStageIn` / `tabPanelIn` on `/memory`, `/mind`, `/profile`, `/import`, and `/settings/agents`, with no horizontal overflow on desktop or 390x844 mobile; artifacts `output/playwright/motion-pass-memory-route.png`, `motion-pass-mind-tab.png`, `motion-pass-profile-tab.png`, `motion-pass-mobile-memory-route.png`, `motion-pass-mobile-profile-tab.png`, `motion-pass-mobile-import-route.json`, and `motion-pass-mobile-settings-route.json`. | Pending |
| P5-009 | P3 | Verified | Memory Engrams console hygiene | The Memory Engrams tab emitted React duplicate-key warnings when repeated tag labels appeared in a row, adding noisy console output during tab-transition verification. | Transition sweeps should not reveal avoidable console warnings from repeated visible data. | Keyed repeated engram tags by label plus position so duplicate labels remain stable. | `npx tsc --noEmit`; `npm run verify`; local Playwright `/memory` -> Engrams after the key fix recorded 0 errors and 0 warnings in `output/playwright/motion-pass-console-after-keyfix.log`; final console capture `output/playwright/motion-pass-console-final.log` also recorded 0 errors and 0 warnings. | Pending |
| P5-010 | P3 | Verified | Release metadata / install surface | Launch checklist still lacked confirmed social-share metadata and a web manifest even though favicon and robots assets existed. | The root document should expose favicon, canonical URL, theme color, social title/description/image tags, robots, sitemap, and a valid web manifest. | Added canonical/social/theme/app meta tags to `index.html`, added `public/site.webmanifest`, added `public/sitemap.xml`, linked the sitemap from `robots.txt`, and added a static regression test. | `npx vitest run src/test/launchReadiness.test.ts src/test/corsAllowlist.test.ts`; `npm run verify`. | Pending |
| P5-011 | P2 | Verified | Initial payload release gate | The checklist still needed a repeatable proof that `/chat` first-paint initial JS/CSS stays under the 500 KiB gzip launch budget. | The launch verification command should fail if Vite's initially referenced JS/CSS assets exceed 500 KiB gzipped. | Added `scripts/check-launch-payload.mjs`, wired it into `npm run verify`, and marked the launch checklist payload gate green. | `npm run build`; `npm run check:launch-payload`; `npm run verify`. Current built initial payload: 300.1 KiB gzip. | Pending |
| P6-001 | P1 | Verified | Projects data model / thread organization | Users needed real project workspaces before larger collaborative-agent features: threads could not be grouped into durable project folders or carry scoped instructions. | Projects should be user-owned, RLS-protected, assignable to threads, archivable, and safe to deploy without weakening existing thread behavior. | Added `public.projects` with owner RLS/service-role policy, thread `project_id`, owner-validation trigger, indexes, Supabase types, `projectStore`, and thread-store project assignment/create-thread support. | `npx tsc --noEmit`; `npx vitest run src/test/projectStore.test.ts src/test/threadStore.test.ts src/test/sessionReset.test.ts --reporter=verbose`; migration `20260506124500_projects_mvp.sql` source inspection. | Pending |
| P6-002 | P1 | Verified | Project runtime context | Project instructions would be useless if they stayed in the organizer UI and did not enter Luca's actual runtime prompt. | Any thread assigned to a project should carry project name/description/instructions into the chat runtime as active workspace context, below locked identity and explicit user control. | Added `_shared/projects/context.ts`, loaded project context by `thread_id` in `chat` and `chat-multi`, and passed `projectContextBlock` into Luca, Vektor, custom-agent, council, and OpenRouter Agent SDK message assembly through the existing system prompt path. | `deno check supabase/functions/_shared/projects/context.ts supabase/functions/chat/index.ts supabase/functions/chat-multi/index.ts`; `npx vitest run src/test/projectContext.test.ts src/test/projectsMvp.test.ts --reporter=verbose`. | Pending |
| P6-003 | P2 | Verified | Projects navigation / MVP UI | A project system hidden behind data and runtime wiring would not be usable. | Users should be able to create/manage projects, edit project instructions, create project chats, assign/remove existing threads, and reach Projects from desktop rail/sidebar, mobile drawer, and command palette. | Added `ProjectsView`, `SidebarProjects`, `/projects` routes, desktop rail/sidebar entry, mobile drawer entry, mobile header metadata, and command-palette route. | `npx tsc --noEmit`; `npx vitest run src/test/mobileShell.test.ts src/test/projectsMvp.test.ts --reporter=verbose`; `npm run verify`; unauthenticated local browser protected-route smoke `output/playwright/projects-mvp-protected-route.png`. Authenticated `/projects` smoke is pending until hosted migration apply. | Pending |
| P6-004 | P1 | Verified | Projects deploy compatibility | Lovable's temporary fix for pre-migration `project_id` insert errors removed generated project types and stopped project-scoped thread creation. | Ordinary chat should work before the migration is applied, while project chats should still create threads with `project_id` after the migration lands. | Restored the `projects` table and `threads.project_id` generated types, then changed `createThread` to omit `project_id` for ordinary chats and include it only for project-scoped chats. | `npx tsc --noEmit`; `npx vitest run src/test/projectsMvp.test.ts src/test/threadStore.test.ts src/test/openRouterAgentRuntime.test.ts --reporter=verbose`; `npm run verify`. | Pending |
| CP-CHAT-011 | P1 | Verified | Runtime prompt de-dupe | The UI showed one user message, but the model could receive the same turn twice because the frontend persisted the user row before `chat-multi`, then the continuity packet loaded that row as history and the runtime appended the live request again. | The current user turn should appear exactly once in the model prompt: prior history first, then the live request message. | Added `removeCurrentUserMessageFromHistory` to trim only the trailing matching user row from continuity history before runtime prompt assembly, including attachment-context requests. | `npx vitest run src/test/continuityKernel.test.ts --reporter=verbose`; `npx tsc --noEmit`; `deno check supabase/functions/_shared/continuity/kernel.ts supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts`; `npm run verify`. | Pending |
| CP-CHAT-012 | P1 | Verified | Normal chat latency | Hosted Luca sends became slow again after Agent runtime deployment because the non-SDK fallback still ran the legacy tool planner on every normal chat turn. | Normal chat should stream through the standard path; tool planning should run only when Agent mode or an explicit agent runtime is requested. | Added `shouldRunLegacyToolPlanner` gates to `chat` and `chat-multi`; Agent mode and explicit runtime requests still use SDK/legacy tool paths, while ordinary `agent_mode: "chat"` sends skip tool planning. | `deno check supabase/functions/chat-multi/index.ts supabase/functions/chat/index.ts supabase/functions/_shared/projects/context.ts`; `npx vitest run src/test/projectsMvp.test.ts src/test/threadStore.test.ts src/test/openRouterAgentRuntime.test.ts --reporter=verbose`; `npm run verify`. | Pending |
| CP-CHAT-013 | P2 | Verified | Chat polish rollback | The post-polish chat pass added a new reasoning renderer, broad CSS motion changes, drawer typography rewrites, and streaming animation changes that Riley reported made the experience feel worse. | The app should return to the last stable chat UI while preserving functional runtime fixes and leaving a clean base for a more deliberate polish pass. | Reverted `de22283 polish(chat): refine messaging motion and drawer typography`, removed the `ThinkingBlock` layer/test, and kept the runtime prompt de-dupe and Agent trace functionality intact. | `git revert de22283`; `npx tsc --noEmit`; `npx vitest run src/test/projectsMvp.test.ts src/test/threadStore.test.ts src/test/openRouterAgentRuntime.test.ts --reporter=verbose`; `npm run verify`. | Pending |

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

Phase 3 scope guard: this is a functional, interaction, motion, layout, typography, performance, and reliability sweep, not an artistic design pass. Record aesthetic/design-preference notes only when they materially affect usability, legibility, type hierarchy, layout integrity, motion clarity, or task completion. Riley will handle the separate artistic visual-design pass.

For each surface: empty / typical / heavy / loading / error state where practical. Check routing, controls, data persistence, realtime behavior, keyboard/focus basics, mobile layout, overflow, typography scale and hierarchy, line-height/readability, label/button text fit, responsive text behavior, transitions/animations, reduced-motion behavior where relevant, console errors, and obvious performance jank.

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
- [x] **11.5** Mobile (<768px) — every main route either uses mobile shell or has graceful fallback (no horizontal scroll, composer reachable). Verified in the dedicated native mobile shell pass across 390x844, 393x852, 430x932, and desktop regression checks.
- [ ] **11.6** Tablet (768-1024) — sidebar collapse + drawer overlap behavior sensible.
- [ ] **11.7** Forms — `<label for>` associations; errors `aria-live="polite"`.
- [ ] **11.8** Heading hierarchy — single h1 per route, h2/h3 nested correctly.

---

## 12. Visual polish & copy

- [ ] **12.1** Empty states — engrams, threads, journal, checkpoints, scheduled tasks, skills, imports, beliefs, pending revisions, sub-agents.
- [ ] **12.2** Loading skeletons (not spinners) on first paint of each route.
- [ ] **12.3** Error states distinct from empty; offer recovery action ("Retry", "Open settings").
- [ ] **12.4** Microcopy pass — eyebrow consistency, sentence-case discipline, no developer jargon.
- [x] **12.5** Motion — first-turn chat handoff, protected route transitions, Memory/Mind/Profile tab transitions, mobile containment, drawer motion, and graph reduced-motion behavior have current browser/test evidence.
- [x] **12.6** Favicon, social-share `og:` meta, robots.txt, sitemap, and web manifest.
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
