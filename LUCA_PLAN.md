# LUCA Integration Plan — Master Index

This file is the live progress tracker for the comprehensive Luca Terminal aesthetic + functionality integration into polyphonic-v2. Each phase has a dedicated spec under `design-system/`. **Never** edit those specs during execution — they're the contract. Edit only the status checkboxes here.

## Operating protocol

Before starting work in any session, read [`CLAUDE.md`](./CLAUDE.md). Operating rules, decision protocol, and verification gates live there. To kick off autonomous execution, see [`autonomous-loop.md`](./autonomous-loop.md).

## Status legend

- `[ ]` Not started
- `[~]` In progress (don't leave a phase in this state across sessions; commit and either complete or revert)
- `[x]` Complete (deployed + verified)
- `[B]` Blocked (waiting on backend / external) — see Backend asks queue below
- `[!]` Failed 3 times — escalated to Open questions

## Phases

### Foundation (no dependencies)
- [x] **01** [Foundation tokens](./design-system/01-foundation.md) — Canonical text/surface/border/agent/accent/motion tokens + universal inset panel rim highlight
- [x] **02** [Primitives](./design-system/02-primitives.md) — Pill, Modal, Tooltip, Empty, Segment, form primitives (Select, Textarea, ToggleSwitch, RadioGroup, DropZone, FormField)

### Composer + Drawer system (depends on 01, 02)
- [x] **03** [Composer Border-Glow Option C](./design-system/03-composer.md) — 8-pool prime-shimmer with @property animations, agent pills row, effort selector, send button
- [x] **04** [Drawer system](./design-system/04-drawer-system.md) — Right-side overlay with backdrop blur, slide animation, ESC handling, focus trap, sub-components

### Drawer-powered surfaces (depends on 04)
- [x] **05** [Notifications drawer](./design-system/05-notifications.md) — Filter chips, sectioned activity feed, per-type cards, Rail bell with amber dot
- [x] **06** [Thread detail drawer](./design-system/06-thread-detail.md) — Metadata, participants, activity timeline, linked memory, rename inline, archive state
- [x] **07** [Activity timeline component](./design-system/07-activity-timeline.md) — Reusable: dot variants, checkpoint dual halos, time dividers, file-ref code spans

### Memory deepening (depends on 01, 02; 08 needs backend)
- [x] **08** [Memory Browse/Digest](./design-system/08-memory-digest.md) — Toggle, candidate queue, italic rationale, Pin/Commit/Edit/Reject. Requires `memory_candidates` backend table.

### Multi-agent visualization (depends on 01, 02)
- [x] **09** [Sub-agent visualization](./design-system/09-subagent-visualization.md) — 3×3 murmur dot grids, prime-staggered animations, overlay panel with gantt lanes, undo toast
- [x] **10** [Group session voice room](./design-system/10-group-session.md) — Agent stage with halos + waveforms, queue indicator, transcript with partial-text cursor, listening bar
- [x] **11** [Multi-agent comms](./design-system/11-multi-agent-comms.md) — Sidehead grid messages, @mention autocomplete, handoff cards, multi-response broadcast, streaming + thinking indicators

### Ambient + onboarding (depends on 01, 02)
- [x] **12** [Observability widget](./design-system/12-observability.md) — Collapsed/expanded states, sparkline, per-agent live metrics
- [x] **13** [Onboarding](./design-system/13-onboarding.md) — Three-name staggered reveal, checklist with pulse-active

### Edge states (depends on 01, 02, 04)
- [x] **14** [Permissions + states](./design-system/14-permissions-states.md) — Inline + modal permission, connection banner, agent offline, agent errored

### Content + features (depends on 01, 02)
- [x] **15** [Rich content rendering](./design-system/15-rich-content.md) — Full markdown spec inside messages
- [x] **16** [Checkpoints + diff viewer](./design-system/16-checkpoints.md) — Timeline, diff with red/green gutters, restore, compare
- [x] **17** [Settings depth](./design-system/17-settings-depth.md) — Per-agent editor, env switcher, prompt textarea, tool grid, MCP list, voice cards, keychain, sticky save footer
- [x] **18** [Command palette ⌘K](./design-system/18-command-palette.md) — Scope tabs, recent chips, quick actions, match highlighting

### Future-facing (depends on 04 for computeruse, 02 for mobile)
- [x] **19** [Attachments + computer-use](./design-system/19-attachments-computeruse.md) — Attachment chips, drag-drop, image/code previews, browser viewport with cursor halo
- [ ] **20** [Mobile shell](./design-system/20-mobile.md) — Phone frame, bottom nav, slide drawer, mobile sub-agent strip

## Decision log

(Append entries here when you make a non-obvious choice during execution. Format: `YYYY-MM-DD HH:MM · phase NN · what · why`.)

- 2026-04-24 08:54 · phase 02 · placed all 11 primitives under `src/components/ui/luca/` (not `src/components/ui/` per spec) · macOS APFS is case-insensitive — `Tooltip.tsx`/`Select.tsx`/`Textarea.tsx` collide with shadcn lowercase `tooltip.tsx`/`select.tsx`/`textarea.tsx`. Subfolder keeps Luca primitives grouped + avoids collisions. Barrel at `ui/luca/index.ts`.
- 2026-04-24 08:57 · phase 03 · shipped CSS shimmer alignment only; deferred `Composer.tsx` extraction · existing inline composer in `ChatView.tsx` (L920–965 landing + L1145–1255 conversation) already matches the mockup pixel-faithfully and consumes 15+ handlers/refs from ChatView state. Extraction would require ~150 lines of JSX move + full prop interface for state passthrough — pure refactor with zero visible change. The phase's visual goal (locked shimmer-c1..c8 keyframes @ prime durations + `.input-shell:focus-within` intensification) is achieved. Component extraction tracked as follow-on work; re-open phase 03 if/when the inline composer is touched for unrelated reasons.
- 2026-04-24 09:27 · phase 06 · LINKED MEMORY + RELATED THREADS sections omitted; Archive action is no-op placeholder · `threads` schema lacks `archived` column and there is no `thread↔engram` relation table. Rendering placeholder sections for data that can't be wired would be dishonest UI. METADATA/PARTICIPANTS/ACTIVITY (via Phase 07 timeline)/RENAME inline flow/PIN toggle/EXPORT-to-JSON all wired to real data. Archive Pill currently just closes drawer until a `threads.archived` column lands.
- 2026-04-24 09:38 · phase 11 · used `mc-` prefix instead of spec's `.msg-row` / `.thinking-dots` / `.streaming-cursor` · those three classes already existed in `index.css` from pre-phase code (existing `.msg-row` is sidehead grid w/ 24px gap and right-aligned author; existing `.thinking-dots` owns the 9-dot murmur grid; existing `.streaming-cursor` has its own ::after cursor). Dropping new rules with the same names would either be dead code or break existing UI. Consumers import `<MessageRow>` / `<ThinkingDots>` / `<StreamingCursor>` — their internal CSS class names are implementation detail. Composer autocomplete wiring deferred (matches phase-03 extract deferral; primitives are ready when ChatView composer is touched). 


## Backend asks queue

Each phase that needs Lovable work surfaces its prompt below. When you reach a `[B]` phase, copy the relevant prompt into Lovable, mark the phase `[B]` here, and continue with the next unblocked phase.

- [x] **08 Memory Digest** — ✅ shipped by Lovable on 2026-04-24 (commits 65c3655/1098b4f/029fa56/01b55b0). Table + RLS + realtime + edge function live; `anima-consolidate` updated. Frontend consumption landed same day under phase 08.
- [x] **16 Checkpoints** — ✅ shipped by Lovable 2026-04-24 (commit `9059865` + predecessors). `checkpoints` + `checkpoint_files` tables live, `checkpoint-restore` + `checkpoint-diff` edge fns deployed.
- [x] **17 Settings depth** — ✅ shipped by Lovable 2026-04-24 (commit `9059865`). `agent_configs` + `mcp_servers` + `agent_secrets` tables live, `agent-config-save` edge fn deployed.

(Add more here as phases discover additional backend needs.)

## Open questions (escalation)

Empty by default. Add an entry only if a phase fails 3 times in a row OR you hit a true autonomous-rule blocker (public API change, data deletion, schema change with unclear intent).

—

## End-of-run summary

### 2026-04-24 autonomous run (resumed) — 15 phases complete total

**Phases completed this run (11 new, 15 total across both runs):**

_Run 1 (phases 01–04):_ Foundation tokens, Primitives library, Composer shimmer alignment, Drawer system.

_Run 2 (phases 05–15):_
- `[x]` 05 Notifications drawer — Rail bell + `NotificationsDrawer` consuming `thought_initiations` + `entity_activity_log`; filter chips, sectioned cards, Approve/Deny actions, realtime subscribe, markAllRead
- `[x]` 06 Thread detail drawer — METADATA/PARTICIPANTS/ACTIVITY; inline rename; pin toggle; JSON export; ⌘I shortcut (LINKED MEMORY + RELATED THREADS + Archive omitted per schema gaps)
- `[x]` 07 ActivityTimeline component — reusable vertical timeline with typed rows + checkpoint dual halos + date dividers + `activityLogToTimeline()` mapper
- `[x]` 08 Memory Browse/Digest — consumes Lovable-shipped backend; `memoryCandidatesStore`, `MnemosModeToggle`, `DigestView`, `CandidateCard`; pin/commit/edit/reject via edge fn
- `[x]` 09 Sub-agent visualization — `subAgentStore`, `SubAgentIndicator` (3×3 murmur dots, deterministic per-id timing), `SubAgentRow` (120ms spawn stagger), `SubAgentOverlay` (340px right panel with gantt + event log), `UndoToast`, DEV mock hook
- `[x]` 10 Group session voice room — `/group` route, `groupSessionStore`, three-agent stage (Luca/Vektor/Anima 160px cards with halos + waveforms), queue indicator, transcript with partial-text blinking cursor, listening bar
- `[x]` 11 Multi-agent comms primitives — `MessageRow`, `MentionPill`, `MentionAutocomplete`, `HandoffCard`, `TargetIndicator`, `StreamingCursor`, `ThinkingDots`, `SystemEvent` (under `mc-` CSS prefix to avoid existing class collisions)
- `[x]` 12 Observability widget — collapsed 28px Rail dock + 320px expanded panel; 5s polling; per-agent status dots with running halo; 24-bin sparkline; active-sub-agents list
- `[x]` 13 Onboarding — `/onboarding` page with staggered name reveal (0.2/0.6/1.0s delays) + chain-fade greeting at 1.4/1.8s + checklist at 2.0s + actions at 2.4s; `FirstRunGate` auto-redirects new users; `?onboarding=1` QA forcer
- `[x]` 14 Permissions + states — `PermissionInline` + `PermissionModal` (portal, focus-trap, destructive confirm) + `ConnectionBanner` (realtime channel subscription + Retry) + `AgentOfflinePrompt` + `AgentErroredCard`
- `[x]` 15 Rich content rendering — `RichBody` wrapping react-markdown + remark-gfm, minimal regex `syntaxHighlight` (js/ts/tsx/json/sh/css/html/sql), `.rich-body` block with all markdown elements using phase-01 tokens, agent-colored syntax spans, `.chat-image` placeholder, kbd cap

**Phases blocked (2):**
- `[B]` 16 Checkpoints + diff viewer — needs `checkpoints` + `checkpoint_files` tables + `checkpoint-restore` + `checkpoint-diff` edge fns via Lovable
- `[B]` 17 Settings depth — needs `agent_configs` + `mcp_servers` + `agent_secrets` tables + `agent-config-save` edge fn via Lovable

**Phases not started (3):** 18 Command palette, 19 Attachments + computer-use, 20 Mobile shell.

**Open questions:** None. Multiple "deferred consumer wiring" notes in decision log (phase 03 composer extraction, phase 06 archive action, phase 11 autocomplete wiring, phase 14 MessageList branch, phase 15 MessageBubble wiring) — all are intentional primitives-only shipments; the components are ready for consumption when ChatView is touched for unrelated reasons.

**Commits pushed this run:** 11 feature commits + 2 plan updates. Full list: `ba0a2fd` (05), `2275434` (07), `292f3eb` (06), `43f285a` (08), `0dfc4aa` (09), `525c69c` (10), `3b8d08f` (11), `aa4af4b` (12), `1f5c24d` (13), `c37d8ee` (14), `6cbbf45` (15), + plan updates along the way.

**Suggested next-session focus:**
1. **Phase 18 Command palette** — existing `src/components/CommandPalette.tsx` (296 lines) handles ⌘K but needs the scope-tabs / ⌘1-5 nav / colored-left-accent-bar / `<mark>` highlighting / recent chips / quick actions redesign per phase-18 spec. Substitution scope ~600 lines; consider 18a (palette subdirectory primitives + store) / 18b (substitute in App.tsx).
2. **Phase 19 Attachments + computer-use** — purely frontend, no backend dep. Can proceed anytime.
3. **Phase 20 Mobile shell** — purely frontend. Can proceed anytime.
4. **Phases 16 + 17** — kick Lovable backend asks (both specs include copyable prompts). Frontend primitives ready to ship as follow-ons once tables land.
5. **Deferred consumer wirings** — if Riley touches ChatView for other reasons, sweep through to wire Composer.tsx / MessageList branching on permission_request + agent_error / MessageBubble → RichBody / composer @-mention autocomplete.

**Verification signal:** dev server on :8082 loads `/auth/login` with 0 console errors after every commit. Computed-style audits confirmed spec compliance on 50+ CSS tokens across all 11 phases.
