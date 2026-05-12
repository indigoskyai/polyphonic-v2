# Luca Agentic Upgrade — Progress Tracker

Plan: `.lovable/plan.md`

## Phase A — Backend image gen ✅
## Phase B — Perplexity browsing ✅ (already wired, citations now extracted)

## Phase C — Frontend rich media ✅ (this turn)
- [x] `MediaLightbox.tsx` — portal, ESC, body-scroll lock, download (PNG/SVG), copy link, edit-with-prompt input
- [x] `ImageCard.tsx` — tap-to-expand, blur-up shimmer, hover save chip, agent-tinted background
- [x] `SvgCard.tsx` — sandboxed iframe, preview/code toggle, expand → lightbox with svg download
- [x] `SearchCitationsCard.tsx` — Perplexity citation chips with favicon-host + snippet tooltip
- [x] Wired into `MessageItem.tsx` (image cards via meta.kind, citations via msg.metadata.citations)
- [x] `chat-multi` extracts `web_search`/`read_url` citations into message metadata (streaming + final paths)
- [x] Composer prefill listener in `ChatView` (`window 'luca:prefill-composer'`) so "Edit with prompt" auto-sends an `edit_image` instruction
- [x] Inline media CSS in `index.css` (shimmer, lightbox, citations grid, mobile-safe toolbar)
- [x] Deployed: chat-multi

## Phase D — Agent prompt + autonomy tuning ✅
- [x] Planner auto-resolves "edit it / make it darker" by querying the thread's most recent assistant message attachments and injecting the storage_path into the planning system prompt.
- [x] Planner prompt teaches generate_image vs create_artifact (svg) + web_search→read_url chaining (Phase A).
- [x] Single-shot planner is correct: multi-step happens via subsequent user turns; chairman receives ground-truth tool summary already.
- [x] Deployed: anima-tool-execute.

## Phase E — E2E verification (manual)
Send these prompts in /chat and confirm:
- "Paint a watercolor fox" → inline image → tap to expand → Download → "Edit with prompt: make it nighttime"
- "Make me an SVG icon of a mountain" → SVG card → expand → Download .svg → toggle source
- "What happened in AI news this week?" → citations card with source chips
- "Read https://example.com and summarize" → summary + citation chip
- Mobile 390×844: cards + lightbox stay tap-friendly
- Zero new console errors

## Decision log
- "Edit with prompt" prefills the composer with an explicit storage_path reference instead of mutating state directly — keeps the planner in the loop and visible to the user.
- Lightbox uses a portal + body overflow lock so it works on any page; sandboxed iframe (no allow-*) keeps SVG previews safe.
