# AUDIT_PASS — Visual + functional sweep after 20-phase blueprint execution

## Context

All 20 phases of the Luca integration blueprint shipped autonomously across 3 runs (commits `67d491a` through `ee64c5b`). Primitives are built and tested in isolation, but Riley has flagged **4 visible issues** from usage and the autonomous session noted **~8 deferred consumer wirings** where primitives haven't been plugged into their consumers yet.

This pass sweeps all of those in a single pragmatic session. Every fix is an **in-place edit** — no new components, no architectural changes. The goal is: every surface in the app matches its mockup at `localhost:9000/...` within tolerance, and every primitive is actually consumed by its intended surface.

Operate per `CLAUDE.md`. Same autonomous-loop rules apply: commit per sub-section, push, mark `[x]`, continue until all sub-sections are `[x]` OR a stop condition fires.

## Stop conditions

- All sub-sections below are `[x]`
- 3+ sub-sections in `[!]` state (failed 3× each)
- Context approaching 80% used
- A whole-app visual check (Part C) reveals a systemic issue that requires a new phase spec — in that case, write the new phase doc under `design-system/`, log it in the Decision log, stop.

## Reference

- Mockup server: `http://localhost:9000/...` — start via `cd /Users/rileycoyote/clawd-luca/luca-terminal-v2/docs/luca-terminal-complete && python3 -m http.server 9000 &` if not running
- Dev server: `http://localhost:8082/`
- Design system specs: `design-system/01-foundation.md` through `20-mobile.md` (contract — don't edit)
- Memory + protocol: `CLAUDE.md`, `LUCA_PLAN.md`

---

# Part A — Visible issues (Riley's observations)

## A.1 — Typography sizing drift

**Symptom:** Text sizes feel inconsistent across surfaces. Some text looks bigger than mockup, some smaller. Probably a side effect of each phase spec-ing its own inline `font-size` values without global cross-reference.

**Root-cause hypotheses (investigate in order):**
1. Inline `font-size: Npx` values drifted from mockup spec across phases
2. Tailwind utility classes (`text-xs`, `text-sm`, etc.) mixed with explicit font-sizes inconsistently
3. Some components inherited a parent font-size they shouldn't have
4. `root` or `html` font-size was changed inadvertently

**Tasks:**
- [ ] **A.1.a** Inventory. In Playwright, navigate each major surface and run:
  ```js
  () => {
    const nodes = document.querySelectorAll('body *');
    const sizes = new Map();
    nodes.forEach(n => {
      const cs = getComputedStyle(n);
      const size = cs.fontSize;
      if (!sizes.has(size)) sizes.set(size, 0);
      sizes.set(size, sizes.get(size) + 1);
    });
    return [...sizes.entries()].sort((a,b) => b[1]-a[1]).slice(0, 30);
  }
  ```
  For each surface, capture the font-size histogram. Surfaces to check: `/chat`, `/memory` (both Browse and Digest modes), `/mind`, `/profile`, `/settings/agents`, `/settings/agents/luca`, `/checkpoints`, `/_mobile`, and any drawer open state (`/chat` with notifications drawer, `/chat` with thread-detail drawer).
- [ ] **A.1.b** Compare to mockup. Open equivalent mockup URL in Playwright (second tab/session), run same snippet, diff.
- [ ] **A.1.c** For each outlier (size that exists in app but not mockup, or size used ≥20% differently), trace to source via grep for the literal `fontSize: 'Npx'` or Tailwind class.
- [ ] **A.1.d** Fix in place. If a phase spec has a different value, defer to the spec. If mockup says 13px and app renders 14px, fix the app. If app has an outlier that's neither in mockup nor in spec, normalize to closest canonical size.
- [ ] **A.1.e** Re-run the histogram — surfaces should collapse to the canonical size ladder (10/11/12/13/14/18/20/24/32 per the spec).

**Verification:** Histogram matches mockup within ±1 size variant per surface. Visible spot-check: body text reads at consistent density across `/chat`, `/memory`, `/mind`.

**Commit:** `audit: typography sizing — normalize to canonical ladder across surfaces`

## A.2 — Right drawer disproportionate

**Symptom:** Drawer at 420px against sidebar at 220px feels visually heavy. Might also be: backdrop blur too aggressive (should be 2px per spec), drawer shadow too strong, OR the overall canvas width:drawer width ratio feels off vs mockup.

**Tasks:**
- [ ] **A.2.a** Measure: with drawer open on `/chat` in Playwright, screenshot. Then open equivalent mockup scene (thread-detail drawer open) at `localhost:9000/mockups/phase-2/luca-terminal-thread-detail.html`. Overlay or compare side-by-side.
- [ ] **A.2.b** Check computed styles on `.drawer`:
  ```js
  () => {
    const d = document.querySelector('.drawer[data-open="true"]');
    const cs = getComputedStyle(d);
    return { width: cs.width, boxShadow: cs.boxShadow, transform: cs.transform };
  }
  ```
  Compare to spec: `420px`, `--shadow-inset-highlight, --shadow-drawer-near, --shadow-drawer-far`, `translateX(0)`.
- [ ] **A.2.c** Check backdrop blur: navigate to `.drawer-backdrop[data-open="true"]`, read `backdrop-filter`. Should be `blur(2px)`, not stronger.
- [ ] **A.2.d** Judgment call: if drawer + sidebar ratio feels off even when both match spec, options in order of preference:
  - Option 1 (preferred): widen sidebar to 260px — small change, improves balance, closer to mockup phase-2 thread-detail.
  - Option 2: narrow drawer to 380px — still spec-compliant per Phase 04 allowing default override; updates `--drawer-width`.
  - Option 3: lighter drawer shadow if it's overpowering.
  
  Make the call, log in Decision log with reasoning. Don't ship all three.
- [ ] **A.2.e** If changed: update `Phase 04` spec doc to reflect the new value (this is the one spec-doc edit allowed during audit pass — call it out in commit).

**Verification:** Drawer open + main content: visual proportion feels balanced. Screenshot comparison with mockup is within tolerance.

**Commit:** `audit: drawer proportion — <sidebar widened to 260 | drawer narrowed to 380 | shadow lightened>`

## A.3 — Text input border visible at rest

**Symptom:** The composer text input has a visible line at rest (not focused). Likely the border-glow Option C shimmer is peaking too bright on some pools, making the "border" look solid instead of a subtle shimmer.

**Tasks:**
- [ ] **A.3.a** Open `/chat` on localhost:8082. Visually compare composer border to mockup `localhost:9000/mockups/artifacts/border-glow-options.html` (Option C section). Is the app version noticeably brighter?
- [ ] **A.3.b** Inspect animated values:
  ```js
  () => {
    const el = document.querySelector('.input-shell');
    const cs = getComputedStyle(el, '::before');
    return {
      animation: cs.animationName,
      duration: cs.animationDuration,
      opacity: cs.opacity,
      background: cs.background.slice(0, 200),
    };
  }
  ```
  Check if `background` resolves to higher-opacity values than expected. Per spec, `shimmer-c1..c8` cycle between ~0.04 and ~0.38 opacity peak per pool.
- [ ] **A.3.c** Also check if `.input-shell` itself has a visible `border` property at rest. It should be `1px solid var(--border)` (rgba(220,219,216,0.08)) — barely visible. If it's using a brighter border, fix.
- [ ] **A.3.d** Check for `box-shadow` at rest. Per spec, input-shell has NO shadow at rest; shadow only appears on `:focus-within`.
- [ ] **A.3.e** Fix options (pick one or combine):
  - Reduce peak shimmer opacity from 0.38 → 0.28 across the 8 keyframes
  - Lighten the solid `--border` on `.input-shell` (override to `--border-faint` for the input shell specifically)
  - Verify `@property` registrations are actually in effect (not all browsers support `@property`; fallback behavior matters)
- [ ] **A.3.f** Post-fix: the border at rest should read as "almost invisible with a subtle breathing" rather than "clear hairline border." On focus, intensify per spec.

**Verification:** Stand back from screen at arm's length. At rest the composer edges should blend softly into the canvas. Focus should bring them forward visibly.

**Commit:** `audit: composer border — tone rest-state intensity to match mockup`

## A.4 — Settings looks like floating card, should be page

**Symptom:** Settings currently renders as a modal/floating card (pre-existing from before blueprint). Phase 17 (Settings depth) shipped the per-agent editor but layered on top of the existing Modal pattern. Per the mockup (`luca-terminal-settings-extensions.html`), Settings should be a full-page surface with left-nav + main content, not a popup.

**Tasks:**
- [ ] **A.4.a** Current state audit: open `/settings` (or however it's accessed currently). Is it a modal? What file handles it? Likely: `src/components/SettingsModal.tsx` + `src/stores/settingsModalStore.ts`.
- [ ] **A.4.b** Check if Phase 17 created a route at `/settings/agents` (and `/settings/agents/:id`). If yes, it's in `src/pages/settings/AgentsList.tsx` / `AgentDetail.tsx` per Phase 17 commit body.
- [ ] **A.4.c** Refactor plan:
  1. Add `/settings` base route as the full-page Settings layout (left nav + content)
  2. Left nav: use `<SidebarRow>` pattern with groups (AGENTS, SYSTEM) matching mockup — entries: Agents, Skills, Routines, Voice & security, Import & export, Account & preferences
  3. Main content routes under `/settings/<category>` — reuse existing Phase 17 `AgentsList` + `AgentDetail` for `/settings/agents`, stub or port existing sub-pages for the rest
  4. Remove the Modal-based settings trigger entirely. Rail settings cog now navigates to `/settings` instead of opening a modal.
  5. Delete `SettingsModal.tsx` + `settingsModalStore.ts` if no longer used
- [ ] **A.4.d** Apply mockup styling from `luca-terminal-settings-extensions.html`:
  - Toolbar with breadcrumb: `§ 05 / DATA PORTABILITY` etc
  - Page header: eyebrow + large title (32px weight 400) + description
  - Section labels (mono 9px uppercase whisper)
  - Field grid for form rows
- [ ] **A.4.e** Apply sticky save footer (per Phase 17 spec — `StickySaveFooter` component already exists in `src/components/settings/`) when fields dirty
- [ ] **A.4.f** Delete the old SettingsModal references if found (`grep -r SettingsModal src/`).

**Verification:** Click settings cog in Rail → navigates to `/settings/agents`. Settings is a full page, matches mockup structure. No modal overlay behavior. Breadcrumb + page header + section styling consistent with mockup.

**Commit:** `audit: settings — convert modal to full-page route surface`

---

# Part B — Consumer wirings sweep

The primitives from phases 11/14/15/19 are built but not plugged into ChatView / MessageList / Composer yet. This pass wires them all. **Single commit for the whole sweep** (unless scope grows past 300 lines, then split B.1-B.4 and B.5-B.8).

## Files affected

- `src/pages/ChatView.tsx` — main touch point
- `src/components/chat/MessageList.tsx` (if exists) or wherever messages render
- `src/components/chat/MessageBubble.tsx`
- `src/components/Composer.tsx` (either create via B.1 or keep inline)

## Tasks

### B.1 — Composer extraction (defer decision revisited)

Phase 03's commit deferred this. Re-evaluate now that other ChatView-touching phases have landed:
- [ ] If ChatView is being touched anyway for B.2-B.8, extract `<Composer />` now — all the state passthroughs are happening regardless.
- [ ] If not, skip and log in Decision log.

### B.2 — MessageList branching for permission_request

- [ ] In the message render function, check message shape: if `message.kind === 'permission_request'` (or `metadata.type === 'permission_request'`), render `<PermissionCard>` from Phase 14 instead of `<MessageBubble>`.
- [ ] Wire Approve / Always / Deny handlers to call the appropriate edge function (likely `permission-action` if it exists, or direct table update otherwise).

### B.3 — MessageList branching for agent_error

- [ ] Same pattern. `kind === 'agent_error'` → `<AgentErroredCard>` with divider line above.
- [ ] Retry handler re-invokes the originating edge function with the same payload.

### B.4 — MessageBubble → RichBody

- [ ] Inside `MessageBubble.tsx`, replace the content render with `<RichBody content={message.content} />` from Phase 15.
- [ ] Keep user-messages as plain text; only agent messages go through RichBody (check `message.role`).

### B.5 — Composer @-mention autocomplete

- [ ] In `<Composer />` (or inline composer), wire `<MentionAutocomplete>` from Phase 11.
- [ ] Detect `@` keystroke in textarea → show dropdown anchored above input (absolute positioning per Phase 11 spec).
- [ ] Filter dropdown by text after `@`.
- [ ] On selection: insert mention pill into the textarea value, add agent ID to `targetedAgents` state.

### B.6 — ChatView drop overlay

- [ ] On ChatView root: `onDragEnter` sets `isDragging: true`. `onDragLeave` (on body) sets false. `onDrop` uploads the file.
- [ ] Render `<DragOverlay>` from Phase 19 when `isDragging` is true — blurred backdrop + center "drop to attach" text.

### B.7 — MessageBubble → MessageAttachment

- [ ] When `message.attachments` exists and has items, render each via `<MessageAttachment>` from Phase 19 below the body.
- [ ] Image attachments use the gradient-placeholder variant; files use the chip variant; code uses the preview-with-fade variant.

### B.8 — 8th wiring (TBD — survey during audit)

- [ ] During B.1-B.7 work, survey for any additional primitives built but not consumed. Candidates:
  - ObservabilityWidget (Phase 12) mounted in Rail footer?
  - Notifications bell unread indicator (Phase 05) pulling from `thought_initiations` count?
  - Thread detail drawer ⌘I trigger (Phase 06) wired in ChatView?
  - Onboarding (Phase 13) gated by first-run check?
- [ ] Fix whichever is discovered unwired. Log in Decision log which one was the 8th.

**Verification:**
- `/chat` with a recent permission request → renders as PermissionCard inline, action buttons work
- `/chat` with an agent error → renders as AgentErroredCard with divider
- Agent messages render markdown properly (tables, code blocks with per-agent syntax colors, kbd pills)
- Typing `@` in composer shows autocomplete; selection inserts pill + adds to targetedAgents
- Dragging a file into ChatView shows the blur drop overlay
- Messages with attachments render MessageAttachment cards below body
- The 8th wiring (whatever it was) is now functional

**Commit:** `audit: sweep consumer wirings — connect primitives to ChatView/MessageList/Composer`

---

# Part C — Whole-app verification sweep

After A + B, open every surface in Playwright and compare to mockup. Log any remaining drift; fix in place if small; surface as new phase if systemic.

## Checklist of surfaces

For each, Playwright-navigate to the app URL, then open mockup URL, screenshot both, compare.

- [ ] **C.1** `/chat` (landing state, no active thread) ↔ `integrated-prototype/luca-terminal-integrated.html` (Chat tab)
- [ ] **C.2** `/chat/:id` (active thread, messages visible) ↔ same
- [ ] **C.3** `/chat/:id` + thread-detail drawer open ↔ `phase-2/luca-terminal-thread-detail.html`
- [ ] **C.4** Rail bell click → notifications drawer ↔ `phase-2/luca-terminal-search-notifications.html` (notifications scene)
- [ ] **C.5** ⌘K command palette ↔ same mockup (palette scene)
- [ ] **C.6** `/memory` Browse mode ↔ `core/luca-terminal-mnemos-mockup.html`
- [ ] **C.7** `/memory` Digest mode ↔ `integrated-prototype/luca-terminal-integrated.html` (Memory Digest scene)
- [ ] **C.8** `/memory` + memory detail (click a row) ↔ Mnemos mockup detail state
- [ ] **C.9** `/mind` Overview + all sub-tabs ↔ (no direct mockup; verify matches Phase 13 + current polish pass intent)
- [ ] **C.10** `/profile` (all sub-tabs) ↔ (no direct mockup)
- [ ] **C.11** `/checkpoints` ↔ `phase-2/luca-terminal-checkpoint-timeline.html`
- [ ] **C.12** `/settings` + `/settings/agents` + `/settings/agents/:id` ↔ `phase-2/luca-terminal-settings-extensions.html` + `core/luca-terminal-settings-mockup.html`
- [ ] **C.13** `/import` (already built; just verify it didn't regress)
- [ ] **C.14** Onboarding scene (simulate first-run by wiping local profile) ↔ `core/luca-terminal-palette-onboarding-observability-mockup.html`
- [ ] **C.15** Permissions inline card in-chat ↔ `core/luca-terminal-permissions-states-rich-mockup.html`
- [ ] **C.16** Permissions modal (destructive) ↔ same mockup
- [ ] **C.17** Agent errored card in-chat ↔ same
- [ ] **C.18** Connection lost banner (simulate by killing network) ↔ same
- [ ] **C.19** `/_mobile` ↔ `core/luca-terminal-computeruse-attachments-mobile-mockup.html`
- [ ] **C.20** Observability widget (if visible by default) ↔ onboarding/observability mockup

For each, log drift in `AUDIT_PASS.md` Decision log:
```
2026-04-YY HH:MM · surface /chat/:id · issue · action taken
```

If drift is < 3px / < 5% opacity → ship as-is (per CLAUDE.md autonomous rules).
If drift is systemic → stop and write new phase doc.

**Verification end state:** Every surface passes the eyeball test against its mockup. Console has 0 new errors across all surfaces.

**Commit:** `audit: whole-app verification sweep — N surfaces checked, M patches applied`

---

# Decision log (audit pass)

(Append entries here as you make calls during the audit. Format: `YYYY-MM-DD HH:MM · section · what · why`.)

—

# End-of-run summary

(Auto-fill at completion with: Part A fixes shipped, Part B wirings landed, Part C surfaces passing/drift, commits pushed, any stop-condition reached.)
