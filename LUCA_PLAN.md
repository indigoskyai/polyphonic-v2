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
- [ ] **02** [Primitives](./design-system/02-primitives.md) — Pill, Modal, Tooltip, Empty, Segment, form primitives (Select, Textarea, ToggleSwitch, RadioGroup, DropZone, FormField)

### Composer + Drawer system (depends on 01, 02)
- [ ] **03** [Composer Border-Glow Option C](./design-system/03-composer.md) — 8-pool prime-shimmer with @property animations, agent pills row, effort selector, send button
- [ ] **04** [Drawer system](./design-system/04-drawer-system.md) — Right-side overlay with backdrop blur, slide animation, ESC handling, focus trap, sub-components

### Drawer-powered surfaces (depends on 04)
- [ ] **05** [Notifications drawer](./design-system/05-notifications.md) — Filter chips, sectioned activity feed, per-type cards, Rail bell with amber dot
- [ ] **06** [Thread detail drawer](./design-system/06-thread-detail.md) — Metadata, participants, activity timeline, linked memory, rename inline, archive state
- [ ] **07** [Activity timeline component](./design-system/07-activity-timeline.md) — Reusable: dot variants, checkpoint dual halos, time dividers, file-ref code spans

### Memory deepening (depends on 01, 02; 08 needs backend)
- [ ] **08** [Memory Browse/Digest](./design-system/08-memory-digest.md) — Toggle, candidate queue, italic rationale, Pin/Commit/Edit/Reject. Requires `memory_candidates` backend table.

### Multi-agent visualization (depends on 01, 02)
- [ ] **09** [Sub-agent visualization](./design-system/09-subagent-visualization.md) — 3×3 murmur dot grids, prime-staggered animations, overlay panel with gantt lanes, undo toast
- [ ] **10** [Group session voice room](./design-system/10-group-session.md) — Agent stage with halos + waveforms, queue indicator, transcript with partial-text cursor, listening bar
- [ ] **11** [Multi-agent comms](./design-system/11-multi-agent-comms.md) — Sidehead grid messages, @mention autocomplete, handoff cards, multi-response broadcast, streaming + thinking indicators

### Ambient + onboarding (depends on 01, 02)
- [ ] **12** [Observability widget](./design-system/12-observability.md) — Collapsed/expanded states, sparkline, per-agent live metrics
- [ ] **13** [Onboarding](./design-system/13-onboarding.md) — Three-name staggered reveal, checklist with pulse-active

### Edge states (depends on 01, 02, 04)
- [ ] **14** [Permissions + states](./design-system/14-permissions-states.md) — Inline + modal permission, connection banner, agent offline, agent errored

### Content + features (depends on 01, 02)
- [ ] **15** [Rich content rendering](./design-system/15-rich-content.md) — Full markdown spec inside messages
- [ ] **16** [Checkpoints + diff viewer](./design-system/16-checkpoints.md) — Timeline, diff with red/green gutters, restore, compare
- [ ] **17** [Settings depth](./design-system/17-settings-depth.md) — Per-agent editor, env switcher, prompt textarea, tool grid, MCP list, voice cards, keychain, sticky save footer
- [ ] **18** [Command palette ⌘K](./design-system/18-command-palette.md) — Scope tabs, recent chips, quick actions, match highlighting

### Future-facing (depends on 04 for computeruse, 02 for mobile)
- [ ] **19** [Attachments + computer-use](./design-system/19-attachments-computeruse.md) — Attachment chips, drag-drop, image/code previews, browser viewport with cursor halo
- [ ] **20** [Mobile shell](./design-system/20-mobile.md) — Phone frame, bottom nav, slide drawer, mobile sub-agent strip

## Decision log

(Append entries here when you make a non-obvious choice during execution. Format: `YYYY-MM-DD HH:MM · phase NN · what · why`.)

—

## Backend asks queue

Each phase that needs Lovable work surfaces its prompt below. When you reach a `[B]` phase, copy the relevant prompt into Lovable, mark the phase `[B]` here, and continue with the next unblocked phase.

- [ ] **08 Memory Digest** — see [phase doc](./design-system/08-memory-digest.md#backend-ask). Creates `memory_candidates` table + modifies `mnemos-consolidate` + adds `memory-candidate-action` edge function.

(Add more here as phases discover additional backend needs.)

## Open questions (escalation)

Empty by default. Add an entry only if a phase fails 3 times in a row OR you hit a true autonomous-rule blocker (public API change, data deletion, schema change with unclear intent).

—

## End-of-run summary

(Auto-fill at end of autonomous run with: phases completed, phases blocked, total commits pushed, any open questions.)

—
