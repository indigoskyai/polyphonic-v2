# Messaging Audit — Round 1 findings

## P0 — Fixed

### 1. All edge functions returning "No API key configured" for users with stored keys
- **Symptom**: Every Luca send returned HTTP 400 `{"error":"No API key configured…"}`. User had a valid encrypted key in `user_api_keys`.
- **Root cause**: `public.decrypt_user_api_key(uuid)` read role only from `current_setting('request.jwt.claim.role', true)`. Postgres / PostgREST now passes the JWT as a JSON blob in `request.jwt.claims`, so the legacy single-claim setting is empty. Service-role calls from edge functions were therefore treated as unauthorized callers and the function raised `Not authorized to decrypt this key`. The Supabase JS client swallows the `RAISE EXCEPTION` into `error` and returns `data: null`, which the caller interpreted as "user has no key".
- **Fix**: Migration updates the function to fall back to parsing `request.jwt.claims::jsonb ->> 'role'` when the legacy setting is empty. Behavior identical otherwise.
- **Blast radius**: Every edge function that calls this RPC: `chat-multi`, `chat-guardian`, `chat`, `subagent-run`, `scheduled-task-run`, `observer-chat`, `observer-watch`, `anima-*` (reflect, question, observe, initiate, image-create, dream, consolidate, connect, tool-execute, think, believe), `mnemos-*` (soften, dialectic, consolidate), `memory-*` (extract, reflect), `journal-write`, `generate-image`, `extract-persona`, `skills-distill`, `_shared/perplexity.ts`. All unblocked by this single fix.

## Phase 2 — Done previously this round
- `RichBody` code blocks render with language tag header + copy button.
- ASCII / box-drawing detection routes unlabeled fenced art to monospace `.text-art-pre` block.
- Markdown links open external in new tab; internal `/path` links use React Router.
- Missing-key 400 from chat now surfaces as an inline assistant message with a deep link to `/settings/models` instead of a runtime toast.

## Verified end-to-end
- `/chat/<thread>` send with a real prompt → Luca streamed correctly, fenced TypeScript code block rendered with `TYPESCRIPT` language tag and `COPY` action.
- Existing HTML artifact from prior session loaded and rendered in the inline artifact card.
- No new console errors.

## Still open (next pass)
- Phase 1 items 4 (abort/cancel persistence), 6 (reload-mid-stream), 8 (8k+ token messages), 9 (rapid back-to-back sends), 10 (typed upstream errors → inline cards).
- Phase 3 — confirm artifact extraction in `chat-multi` (search shows 0 references; artifacts must currently be inserted by a separate path or by the model wrapping content explicitly).
- Phase 4 — Mermaid + inline SVG via `react-markdown` allowlist.
- Phase 6 — Vitest coverage for `threadStore.addMessage` de-dupe and `parseEdgeError`.
