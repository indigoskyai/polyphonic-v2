# CLAUDE.md — polyphonic-v2 operating protocol

This file is for Claude (or any AI agent) working autonomously on polyphonic-v2. Read it in full at the start of every session. It supersedes any general default behavior.

## Project orientation

- **Repo:** `Riley-Coyote/polyphonic-v2`
- **Working directory:** `/tmp/polyphonic-v2/` (throwaway clone). If missing: `git clone https://github.com/Riley-Coyote/polyphonic-v2.git /tmp/polyphonic-v2`
- **Stack:** React 18 + TypeScript 5.8 + Vite 5.4 + Tailwind 3.4 + shadcn/ui + Zustand 5 + Supabase
- **Dev server:** `npm run dev` → typically `http://localhost:8082` (Vite picks first free of 8080/8081/8082)
- **Mockup reference server:** `python3 -m http.server 9000` from `/Users/rileycoyote/clawd-luca/luca-terminal-v2/docs/luca-terminal-complete/` → mockups at `localhost:9000/mockups/...`
- **Lovable workflow:** Riley uses Lovable for backend (Supabase migrations + edge functions). When this plan needs backend work, write a prompt in the phase's "Backend ask" block; Riley will dispatch.

## Master plan

Read [`LUCA_PLAN.md`](./LUCA_PLAN.md) at the start of every session. It's the index of phases, status, and decision log. Never edit phase specs (`design-system/*.md`) — those are the contract. Only edit the status checkboxes in `LUCA_PLAN.md`.

## Hard rules (non-negotiable)

1. **Never edit `docs/luca-terminal-complete/`** anywhere on the filesystem — those are immutable mockup references.
2. **Never mock data in components.** Every value flows from real Supabase tables / Zustand stores / props.
3. **Never commit without Playwright verification** that the affected surface still renders.
4. **Never push with new console errors.** Documented expected 404s (emotional_state legacy column, etc.) are fine; new errors aren't.
5. **Never ask Riley a question** that the autonomous decision rules below cover.
6. **Never use `--no-verify`, `--force`, or destructive git** without explicit Riley approval.
7. **Never edit `LUCA_PLAN.md`'s phase content** — only status checkboxes, decision log, backend asks, end-of-run summary.

## Hard preferences (per Riley's working style)

- Concise responses. Lead with the action taken. Don't re-explain diffs.
- Honest opinions. Give a take, not a list of options.
- Visual excellence is the bar. If something feels white/bright/off, dim it. If something feels dim/unreadable, brighten it. Use mockups as the spec.
- Iterate fast. Small verified increments beat one big unverified push.
- No emojis in UI. SVG icons everywhere (Lucide preferred when filling in unspecified icons).
- Pill buttons for everything button-like (`border-radius: 999px`).
- Agent identity colors are monochrome cream by default; full ochre/blue/magenta only in identity-rich contexts.
- Body text never brighter than `--ink: rgba(244, 243, 240, 0.93)`. That's the cap.

## Autonomous decision rules

Encountering one of these? Apply the rule, don't ping Riley.

| Situation | Action |
|---|---|
| Supabase query returns 400/406 | Check `src/integrations/supabase/types.ts`, fix field names. If column truly missing, add Lovable prompt to phase's Backend ask + mark phase `[B]`. |
| Supabase `.single()` returns 406 (no row) | Switch to `.maybeSingle()`. |
| Promise.all dies because one query fails | Switch to `Promise.allSettled` with per-result guards. |
| Playwright `browser_click` fails "element not stable" | Use `browser_evaluate` with JS click instead. |
| Visual deviation from mockup < 3px or < 5% opacity | Ship as-is. Don't chase pixel perfection. |
| Phase scope grows > 300 lines of changes | Split into sub-phases (e.g. 04a, 04b), commit independently. |
| Verification fails | Fix in same commit before pushing. Never ship broken phases. |
| Animation might violate prefers-reduced-motion | Ensure global `@media (prefers-reduced-motion: reduce)` rule covers it; test with Playwright by emulating that media. |
| Two sources of truth for same data | Prefer the table-backed source over JSONB / store cache. Document the choice in phase Decision Log. |
| New token needed | Add to `:root` per Phase 01 Foundation conventions. Never hardcode a color outside `index.css`. |
| Schema mismatch between code and types.ts | Always fix the code to match types. If types are wrong, regenerate via Supabase CLI (out of scope — escalate). |
| Component library has shadcn equivalent | Use it. Don't reinvent. |
| Style feels off but no spec | Open the relevant mockup at localhost:9000 and match it. |
| Riley's previous decision contradicts new request | Apply the new request, log in Decision Log. |
| Lovable workflow conflict (lockfile, etc.) | Don't fight it — leave Lovable artifacts (`.lovable/`, `bun.lockb`) untouched. |

## When to STOP and add to "Open questions"

- A change would alter a public API contract (edge function signatures, exported types used by other consumers)
- A change would delete user data without explicit instruction
- A change would require a schema migration whose intent isn't clear from context
- 3 consecutive failed attempts on the same task (different errors)

## Verification gates (run per phase before commit)

1. **Playwright visual check** — Navigate to the affected URL on `localhost:8082`. Take a screenshot. Compare with mockup at `localhost:9000`. Adjust if drift > 3px / 5% opacity.
2. **Console check** — `mcp__plugin_playwright_playwright__browser_console_messages level: error` returns no NEW errors.
3. **Keyboard nav check** — Tab through new interactive elements. `:focus-visible` outline visible. ESC closes any modal/drawer.
4. **Reduced motion check** — In Playwright: `mcp__plugin_playwright_playwright__browser_evaluate function: '() => window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener…'` (or use Chrome DevTools Protocol via Playwright's emulation). Animations collapse to ~0ms.
5. **Responsive check** — At 1200×900 viewport, no horizontal scroll on the affected surface.

## Commit discipline

- Format: `<scope>: <imperative description>`
- One commit per phase (sub-phases tightly coupled may share)
- Body: bullet list of what changed + file paths + any backend coordination
- Always push after commit (`git push origin main`)
- Always include co-author trailer: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

Example:
```
phase 04: drawer system — right-side overlay with backdrop blur

- src/components/ui/Drawer.tsx (new) — primitive + sub-components
- src/stores/drawerStore.ts (new) — single-active-drawer state
- src/index.css — .drawer/.backdrop classes + slide animation
- src/App.tsx — mount drawer-router

Verified: Playwright /chat → drawerStore.open('test') → backdrop
blurs, drawer slides in 380ms, ESC closes, click-outside dismisses,
focus trapped inside drawer.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Session start sequence

1. `cd /tmp/polyphonic-v2 && git pull --rebase origin main` — bring local up to date
2. Verify dev server running: `lsof -i :8082` (or :8080/:8081). If not, start: `npm run dev > /tmp/poly-dev.log 2>&1 &`
3. Verify mockup server running: `lsof -i :9000`. If not, `cd /Users/rileycoyote/clawd-luca/luca-terminal-v2/docs/luca-terminal-complete && python3 -m http.server 9000 > /tmp/mockup-server.log 2>&1 &`
4. Read `LUCA_PLAN.md` — find first `[ ]` phase that's not blocked by missing backend
5. Read that phase's full spec under `design-system/`
6. Execute, verify, commit, push, mark `[x]`
7. Repeat from step 4 until: all phases done, OR 3+ phases `[B]`, OR escalation needed

## Tools to prefer

- **Playwright MCP** for visual verification and interaction testing (already wired)
- **Explore subagent** for any task requiring reading > 200 lines of existing code
- **Plain Read** for known specific files (faster than Explore)
- **Edit** for surgical changes; **Write** only for new files or full rewrites

## Tools to avoid

- **TaskCreate/TaskUpdate** — Riley doesn't use it for this project
- **`grep`/`find`/`cat`/`sed`/`awk`** as bash commands — use Grep/Glob/Read/Edit instead
- **`gh` for browsing the repo** — use git locally
- **Browser MCP for production testing** unless verifying a specific deploy

## Where things live

| What | Where |
|---|---|
| Master plan | `LUCA_PLAN.md` (root) |
| Phase specs | `design-system/01-foundation.md` … `20-mobile.md` |
| Operating protocol | `CLAUDE.md` (this file) |
| Autonomous loop trigger | `autonomous-loop.md` |
| App source | `src/` |
| Shared entry components | `src/components/entry/` |
| Drawer/modal/etc primitives | `src/components/ui/` |
| Page-level surfaces | `src/pages/` |
| State (Zustand) | `src/stores/` |
| Supabase client + types | `src/integrations/supabase/` |
| Edge functions (read-only ref) | `supabase/functions/` |
| Migrations (read-only ref) | `supabase/migrations/` |
| Mockup references (immutable) | `/Users/rileycoyote/clawd-luca/luca-terminal-v2/docs/luca-terminal-complete/` |

## Memory + context conservation

- The mockups are huge. Don't re-read them — the design-system/ phase docs ARE the interface to mockup intent.
- If you need to verify a specific animation, open the mockup at localhost:9000 in Playwright and inspect computed styles via `browser_evaluate`.
- Use Explore subagents for any cross-file pattern audit (don't grep multiple files inline).
- Update `LUCA_PLAN.md` after each commit so the next session starts with accurate cursor position.

## Failure recovery

- If a commit was bad: `git revert <hash>` (don't `--force` push to undo).
- If working tree is broken: `git stash` → diagnose → `git stash pop` or discard.
- If a phase keeps failing: mark `[!]` in plan + add Open question, move to next phase.
- If push fails because Lovable pushed first: `git pull --rebase origin main`, resolve conflicts, push again.
