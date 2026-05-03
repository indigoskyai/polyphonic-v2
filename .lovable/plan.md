# Luca Messaging — Audit, Hardening, and Visual-Quality Pass

Goal: bring **Luca-only** messaging (send, stream, render, persist) to a state we'd ship publicly — on par with ChatGPT/Claude/Gemini for: code blocks, artifacts (HTML/React/SVG/Mermaid), diagrams, and ASCII / letter art.

Other agents (Vektor, Anima, Mnemos, group, council, observer) are explicitly **out of scope** for this round, except where they can break Luca.

---

## Phase 0 — Reproduction & baseline

- Reproduce the live error first: `{"error":"No API key configured…"}` returned from `chat-multi`. Console shows it firing on every send.
- Decide root cause path:
  - User has no OpenRouter key saved → expected, but the UX should route them to Settings cleanly, not throw a raw 400.
  - Or `decrypt_user_api_key` RPC is failing → fix server-side.
- Use `supabase--read_query` against `user_api_keys` for the current user, plus `supabase--curl_edge_functions` to hit `chat-multi` with a known-good payload, and `supabase--edge_function_logs` to capture the failing branch.
- Capture a clean baseline screenshot of `/chat/<thread>` via `browser--navigate_to_sandbox` so later passes can diff.

Exit gate: I can produce or block the 400 deterministically and know which branch fires it.

---

## Phase 1 — Send / receive correctness (Luca only)

Audit the full path: `ChatView.handleSend` → `chat-multi` (Luca branch) → SSE stream → `threadStore` realtime → render.

Targets:
1. **API-key UX**: replace the raw 400 with an inline assistant-style message + a "Open Settings" pill. Never let a missing key surface as a runtime error toast.
2. **Optimistic user message**: confirm it appears instantly, with no double-render when the realtime row arrives (the existing 30s de-dupe in `threadStore.subscribeMessages` covers this — verify under fast-send conditions).
3. **Streaming lifecycle**: `isStreaming`, `streamingContent`, `streamingThinking` reset cleanly on success, error, and abort. No "stuck thinking…" state if the SSE pipe drops.
4. **Abort/cancel**: stop button must actually close the SSE reader and persist whatever was streamed so far.
5. **Thread creation**: first message in a brand-new thread creates the row, navigates, and streams in a single flow without losing the user's text.
6. **Reload persistence**: refresh mid-stream → message reappears via `loadMessages` without duplication; refresh after stream → identical content.
7. **Realtime**: second tab open on same thread sees Luca's reply land via the existing postgres_changes channel.
8. **Long messages**: 8k+ token responses don't truncate, don't freeze the UI, scroll stays pinned to bottom while streaming and unpins when user scrolls up.
9. **Rapid send**: 3 messages back-to-back queue correctly; no interleaved streams into wrong rows.
10. **Errors from upstream** (`upstream_unavailable`, `quota_exceeded`, `validation_error` from `lib/edgeError.ts`) render as inline assistant-error cards with friendly copy + retry, not toasts.

Each item gets a checklist entry; bugs found get fixed in the same pass and re-verified with `browser--navigate_to_sandbox` + `browser--observe`/`act`.

---

## Phase 2 — Rich content rendering quality

Make `RichBody` (the markdown renderer used inside `MessageRow`) feel premium.

1. **Code blocks**:
   - Verify the language-tag header renders for all languages in `syntaxHighlight.ts` (js, ts, tsx, json, sh, css, html, sql) and gracefully degrades for unknown langs.
   - Add a **Copy** button to every fenced block (top-right of the header), with success state.
   - Add a **horizontal scroll** with subtle gradient mask for overflow lines.
   - Confirm inline `code` styling is distinct from block code.
   - Test diff/markdown/yaml/python by aliasing them to closest highlighter.
2. **ASCII / letter art**:
   - Force monospace + preserved whitespace for any fenced block AND for content inside `<pre>`.
   - Add a `text-art` heuristic: if a fenced block is unlabeled and contains box-drawing/ASCII glyphs (`╭ ╮ ╰ ╯ ─ │ █ ░ ▒ ▓` etc.), drop the lang header, drop syntax coloring, give it generous letter-spacing 0, line-height 1.0, and a soft surface so it reads as art, not code.
3. **Tables, lists, blockquotes, headings**: audit spacing rhythm against the rest of the Luca-Mind aesthetic; tighten where needed.
4. **Links**: open external in new tab + `rel="noopener"`; internal app links route via React Router.
5. **Math** (light pass): if `$$…$$` appears, render as preformatted; full KaTeX is out-of-scope but flag for later.

---

## Phase 3 — Artifacts pipeline (HTML / React / SVG / Mermaid / Markdown)

Today, `artifactStore` reads rows from an `artifacts` table, and `ChatView` already renders `ArtifactCard` per message. The gap to verify/build:

1. **Detection**: confirm whether `chat-multi` extracts artifacts from Luca's output (search for any artifact-extraction logic; if absent, add one). Heuristic:
   - Fenced ```` ```html ````, ```` ```svg ````, ```` ```mermaid ````, ```` ```jsx ```` / ```` ```tsx ```` over a length threshold → promote to artifact.
   - Explicit `<artifact title="…" kind="…">…</artifact>` tag in Luca's output → authoritative.
2. **Persistence**: writes go to `artifacts` table with `source_message_id` set, versioned via `parent_artifact_id`.
3. **Rendering**:
   - `ArtifactRenderer` must safely render HTML in a sandboxed iframe (`sandbox="allow-scripts"` only, no `allow-same-origin`).
   - React/JSX artifacts compile via in-browser Babel + render in iframe.
   - SVG renders inline with size guard.
   - Mermaid renders via dynamic import.
   - Markdown renders via the same `RichBody`.
4. **Canvas panel**: clicking an artifact opens `CanvasPanel` (right-rail) for full-size view, with copy / download / open-in-new-tab.
5. **Streaming**: artifact placeholder shows during stream, swaps to live preview when the fenced block closes.

System-prompt nudges: append a short "When you produce a runnable HTML page, a React component, an SVG diagram, or a Mermaid graph, wrap it in a fenced block with the proper language tag so the UI can render it as an artifact." to Luca's system prompt only.

---

## Phase 4 — Diagrams & visualizations

1. **Mermaid**: dynamic import + theme tuned to dark Luca palette; error state shows the raw source as a code block instead of a red error.
2. **SVG**: ensure inline SVG inside markdown survives the markdown sanitizer (currently `RichBody` uses `react-markdown` which drops raw HTML by default — verify and, if needed, allow `svg`/`mermaid` blocks via a controlled component allowlist, NOT `rehype-raw` blanket).
3. **Charts**: out-of-scope for autonomous build; flag for later.

---

## Phase 5 — Quality, accessibility, performance

- Keyboard: Enter sends, Shift+Enter newline, ESC cancels stream, ⌘K palette unaffected.
- ARIA: each message is an `article` with role + agent labels (already present); streaming cursor announces nothing (decorative).
- `prefers-reduced-motion`: streaming cursor + msg-enter animation collapse.
- Performance: long threads (200+ messages) don't jank; consider windowing only if measured frame drops occur.
- Console must end the round with **zero new errors**.

---

## Phase 6 — Automated coverage

Add minimal Vitest coverage for the highest-leverage logic (no UI snapshot churn):
- `threadStore.addMessage` realtime de-dupe.
- `lib/edgeError.parseEdgeError` + `friendlyMessage` matrix.
- A small `RichBody` render test for: fenced code, ASCII art heuristic, link target.
- (Optional) one Deno test for `chat-multi`'s artifact-extraction helper if I add it.

---

## Phase 7 — Verification loop (per fix and at the end)

For each bug fixed:
1. `browser--navigate_to_sandbox` → `/chat/<thread>`
2. Drive the scenario via `browser--act`
3. `browser--screenshot` + `browser--read_console_logs` (level: error)
4. If regression, fix in the same commit; re-run.

Final gate: a single end-to-end script that exercises (a) plain reply, (b) code block w/ copy, (c) ASCII art, (d) HTML artifact, (e) Mermaid diagram, (f) abort mid-stream, (g) reload persistence, (h) missing-key UX. All must pass before this round closes.

---

## Out of scope (called out so it stays out)

- Vektor / Anima / Mnemos / Observer / Group session message UX.
- Voice, attachments beyond what already works, mobile shell.
- New visual redesign of the chat surface — only fixes + quality polish on what exists.
- KaTeX / advanced math.
- Full virtualization of the message list (only if Phase 5 measurements demand it).

---

## Deliverables

1. A short `MESSAGING_AUDIT.md` at repo root summarizing every issue found, the fix, and the verification screenshot path.
2. All bugs fixed on `main`-equivalent state with green console.
3. Vitest suite green.
4. End-of-round summary in chat with the checklist + before/after screenshots for the 8 end-to-end scenarios.