# Luca Agentic Upgrade — Progress Tracker

Plan: `.lovable/plan.md`

## Phase A — Backend image gen ✅ (shipped this turn)
- [x] `OPENAI_API_KEY` secret added
- [x] `anima-image-create` rewritten → OpenAI `gpt-image-2` (with `gpt-image-1` fallback), 7-day signed URLs, daily quota
- [x] `anima-image-edit` (new) → `/v1/images/edits` with multipart source image
- [x] `generate_image` + `edit_image` registered in `anima-tool-execute` planner schema
- [x] Planner system prompt updated (raster vs SVG guidance, web_search→read_url chaining)
- [x] `chat-multi` extracts image tool results into `messages.attachments` so they render inline
- [x] Deployed: anima-image-create, anima-image-edit, anima-tool-execute, chat-multi

## Phase B — Perplexity browsing ⏭ (already wired)
- `web_search` and `read_url` already use Perplexity Sonar via `_shared/perplexity.ts`
- Frontend citation rendering pending (Phase C)

## Phase C — Frontend rich media (next turn)
- [ ] `MediaLightbox.tsx` (portal, ESC, download, copy, edit-with-prompt)
- [ ] `ImageCard.tsx` replacing `ImagePreview` — tap to open lightbox, blur-up loader
- [ ] `SvgCard.tsx` — sandboxed iframe + tap-to-expand + view source
- [ ] `SearchCitationsCard.tsx` — Perplexity citations strip
- [ ] Wire into `MessageItem.tsx`
- [ ] Tool-status pill in streaming UX ("Generating image…", "Searching the web…")

## Phase D — Agent prompt + autonomy tuning (next turn)
- [ ] Confirm `stopWhen` ≥ 5 tool hops in chat-multi
- [ ] Tool-result memory so "make it darker" → `edit_image` on last image

## Phase E — E2E verification (final turn)
- [ ] "Draw me a watercolor fox" → inline image, lightbox, download, edit
- [ ] "SVG icon of a mountain" → inline SVG card
- [ ] "What happened in AI news this week?" → citations card
- [ ] "Read https://… and summarize" → read_url
- [ ] Mobile viewport (390×844)
- [ ] Zero new console errors

## Decision log
- Chose direct OpenAI API over OpenRouter for `gpt-image-2` (OpenRouter doesn't expose image-gen for OpenAI image models with the b64 envelope we need for storage upload).
- Quota reuses existing `image-generation` scope (25/day default).
- Source image for `edit_image` referenced by `storage_path` so the LLM only handles small JSON, not base64 blobs.
