# Luca Agentic Upgrade — Image Gen, SVG, Web Browsing, Inline UX

Make Luca feel like ChatGPT/Claude apps: generate images (`gpt-image-2`), generate SVGs, browse the web (Perplexity Sonar), and render all of it inline in chat with expand / download / edit.

## Research notes (locked in before coding)

- **OpenAI Image model**: `gpt-image-2` (latest, April 2025+ generation; `gpt-image-1` is fallback). Endpoints:
  - `POST https://api.openai.com/v1/images/generations` — params: `model`, `prompt`, `size` (`1024x1024`, `1536x1024`, `1024x1536`, `auto`), `quality` (`low|medium|high|auto`), `n`, `output_format` (`png|jpeg|webp`), `background` (`transparent|opaque|auto`). Returns base64 (`b64_json`) by default.
  - `POST https://api.openai.com/v1/images/edits` — multipart with `image` (PNG with alpha = mask area) + `prompt` for edits.
- **Perplexity Sonar**: already wired in `supabase/functions/_shared/perplexity.ts` via OpenRouter (`perplexity/sonar`). Already exposed as `web_search` + `read_url` tools in `anima-tool-execute`. Needs verification + UX surfacing only.
- **Existing image pipeline** (`anima-image-create`) uses an outdated OpenRouter Gemini path — will be replaced with direct OpenAI `gpt-image-2`.
- **SVG path**: `create_artifact` tool already accepts `kind: "svg"` and `ArtifactRenderer.tsx` already renders it via iframe. Needs inline message-bubble rendering + expand/download/edit affordances.

## Architecture overview

```
User chat
  └─► chat-multi (planner) ──► anima-tool-execute
                                   ├─ generate_image  ─► anima-image-create  (gpt-image-2 / OpenAI)
                                   ├─ edit_image      ─► anima-image-edit    (NEW, gpt-image-2 edits)
                                   ├─ create_artifact (kind=svg) ─► artifactStore (existing)
                                   ├─ web_search      ─► anima-web-search    (Perplexity Sonar, existing)
                                   └─ read_url        ─► anima-web-read      (Perplexity Sonar, existing)

Chat surface
  ├─ MessageItem renders inline ImageCard / SvgCard / SearchCitations
  └─ MediaLightbox (NEW) — fullscreen view, download, "Edit with prompt"
```

## Phase plan (track in `LUCA_NEXT.md`, one commit per phase)

### Phase A — Backend: image generation with `gpt-image-2`
1. Add secret `OPENAI_API_KEY` (request via `add_secret` once user confirms).
2. Rewrite `supabase/functions/anima-image-create/index.ts`:
   - Call `https://api.openai.com/v1/images/generations` with `gpt-image-2`, `quality: "high"`, `size: "auto"`, `output_format: "png"`.
   - Decode `b64_json`, upload to `generated-images` bucket (existing), return signed URL + storage path + revised_prompt.
   - Quota via `dailyQuota.checkAndIncrement(userId, "image-generation")`.
3. New `supabase/functions/anima-image-edit/index.ts`:
   - Multipart POST to `/v1/images/edits` with source image (downloaded from storage path) + new prompt + optional mask.
   - Same upload + signed URL flow.
4. Register both in tool planner (`anima-tool-execute`):
   - `generate_image({ prompt, aspect_ratio?, transparent? })`
   - `edit_image({ source_path, prompt })`
5. Verify: `supabase--test_edge_functions` with sample prompt; confirm bucket write + signed URL.

### Phase B — Backend: confirm Perplexity browsing path
1. Confirm `anima-web-search` and `anima-web-read` work end-to-end (they require user OpenRouter key, which is already established).
2. Surface citations cleanly in tool output so the frontend can render them as a card.
3. Verify with `curl_edge_functions`.

### Phase C — Frontend: rich inline media in chat
1. **`ImageCard.tsx`** (new, in `src/components/messages/`):
   - Rounded, shadow-elegant, lazy-load, blur-up placeholder, aspect-ratio preserved.
   - Hover/tap → open `MediaLightbox`. Keyboard-accessible (Enter/Space).
2. **`SvgCard.tsx`** (new): sandboxed iframe at natural size, same hover/tap behavior, "View source" toggle.
3. **`MediaLightbox.tsx`** (new, portal):
   - Fullscreen dim backdrop, ESC closes, swipe-down on mobile.
   - Toolbar: **Download** (PNG/SVG), **Copy link**, **Edit with prompt** (opens inline prompt → calls `edit_image` tool), **Open in new tab**.
   - Pinch/scroll zoom for images.
4. **`SearchCitationsCard.tsx`** (new): render Perplexity results as tap-able source chips with favicon + title + snippet, like ChatGPT browsing UI.
5. Wire renderers into `MessageItem.tsx` based on attachment/tool-result type.
6. Streaming UX: skeleton shimmer while `generate_image` tool is in flight; tool status pill ("Generating image…", "Searching the web…") matching ChatGPT cadence.

### Phase D — Agent prompt + autonomy tuning
1. Update tool-planner system prompt in `anima-tool-execute` to teach Luca when to:
   - generate vs describe an image
   - choose `create_artifact kind=svg` vs raster image (diagrams/icons → SVG, photographic/illustrative → image)
   - chain `web_search` → `read_url` → reply with citations
2. Raise `stopWhen` to allow multi-step tool loops (verify chat-multi already supports ≥5 hops; bump if not).
3. Add lightweight tool-result memory so Luca can reference its own generated image in the next turn ("make it darker" → calls `edit_image` on last image).

### Phase E — E2E verification (mandatory before marking done)
Use `browser--navigate_to_sandbox` + `browser--act` on `/chat/<thread>` and verify:
1. "Draw me a watercolor fox" → image streams into bubble within ~10s, lightbox opens, download works, "Edit with prompt: make it nighttime" produces a new image.
2. "Make me an SVG icon of a mountain" → inline SVG card renders, download as `.svg` works, source view toggles.
3. "What happened in AI news this week?" → search status pill → reply with inline citations card → tapping a chip opens source.
4. "Read https://example.com and summarize" → read_url path, citations rendered.
5. Mobile viewport (390×844): all of the above remain tap-friendly, lightbox respects safe-area.
6. Console: zero new errors. Network: no 4xx/5xx on tool routes.

Loop fixes until all 6 pass.

## Files to add / change

**New**
- `supabase/functions/anima-image-edit/index.ts`
- `src/components/messages/ImageCard.tsx`
- `src/components/messages/SvgCard.tsx`
- `src/components/messages/MediaLightbox.tsx`
- `src/components/messages/SearchCitationsCard.tsx`
- `LUCA_NEXT.md` (progress tracker — phase checkboxes, decision log)

**Edit**
- `supabase/functions/anima-image-create/index.ts` — switch to `gpt-image-2`
- `supabase/functions/anima-tool-execute/index.ts` — register `generate_image`, `edit_image`, refine planner prompt
- `src/components/messages/MessageItem.tsx` — render new cards
- `src/lib/streamingArtifacts.ts` — surface tool-status pills
- `index.css` — lightbox + skeleton shimmer tokens (reuse existing semantic tokens)

## Secrets needed
- `OPENAI_API_KEY` — request via `add_secret` after user confirms Phase A.

## Acceptance criteria
- Inline images and SVGs render at premium quality, tappable, downloadable, editable.
- Web browsing via Perplexity Sonar produces inline citations.
- Tool-status pills match ChatGPT cadence; no jank, no layout shift.
- All 6 E2E checks pass on desktop + mobile viewports with zero new console errors.
- Single commit per phase, progress tracked in `LUCA_NEXT.md`.
