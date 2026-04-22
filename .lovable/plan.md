

# Comprehensive Import, Profile & Insight-Chat Plan

Three coordinated workstreams: (1) full import management, (2) universal multi-platform import, (3) deep evidence-grounded chat about your psychological profile.

---

## Part 1 — Import Management Controls

**New "Imports" tab capabilities** (in `/memory` → Imports):

- **Per-import "Manage" panel** that opens when you click an import row, showing:
  - Source platform, file size, date range, memory/question counts
  - Live pipeline stage if still running
  - Three actions: **Delete import**, **Re-run profiling**, **View memories from this import**
- **Delete import** → confirm dialog → cascades:
  - The `chat_imports` row
  - All `memories` where `provenance->>'import_id'` matches
  - All `curiosity_questions` created in that import's window
  - **Engrams/beliefs are preserved** (they may have been reinforced from other sources)
- **Re-run profiling button** at top of Imports tab → triggers `profile-deep-analysis` against the current memory corpus and bumps profile `version`. Shows live "analyzing..." state with the same polling pattern already used in `ProfileView`.
- **Bulk delete** for selecting multiple imports at once.

**Backend work:**
- Extend existing `clear-import` edge function to a new `delete-import` function that performs hard cascade (it currently soft-marks as "cleared"). Keep the original behavior available via a `mode: 'soft' | 'hard'` parameter.

---

## Part 2 — Universal, Model-Agnostic Importer

Refactor `importStore.ts` parsing into a pluggable **adapter system**. Each adapter exports `{ detect(json), normalize(json) → Conversation[] }` producing the same internal shape (the existing ChatGPT mapping format).

**Adapters to ship:**

| Platform | File format | Notes |
|---|---|---|
| ChatGPT | `conversations.json` | already works |
| Claude | array with `chat_messages` | already works |
| **Gemini** (Google Takeout) | `MyActivity.json` from Takeout → "Gemini Apps" | each entry = single user prompt + response |
| **Grok** (xAI export) | JSON conversation list | similar to ChatGPT shape |
| **X/Twitter — Tweets** | `tweets.js` from X archive | treated as **user-only utterances**; new "tweet-extractor" prompt focused on opinions, interests, beliefs, relational mentions |
| **X/Twitter — DMs** | `direct-messages.js` | treated as **relational conversations**; uses standard memory extractor with the user's handle marked as the user role |
| **Generic JSON/text fallback** | any `.json` or `.txt` | new edge function `import-detect` runs Gemini Flash to inspect a 10KB sample and emit a normalization plan (role mapping, content path) |

**UI changes in `ImportView`:**
- File picker accepts `.json`, `.txt`, `.zip` (zip handled client-side via `jszip` for X archives that ship as a folder)
- After parse, show **detected platform + "is this right?"** confirmation with manual override
- For X archives: two checkboxes — "Include tweets" / "Include DMs" — each runs as a separate adapter pass into the same import_id
- Update the "How to export" instructions to cover all five platforms

**Memory extraction:**
- The existing `import-chatgpt` edge function is renamed conceptually to `import-process` and accepts a `source_type` field. A new tweet-specific system prompt is added for tweet-only data (since there's no AI-side context to weigh against).

---

## Part 3 — Chat With Your Profile (Evidence-Grounded)

A new section inside `/profile` called **"Ask about your profile"** — a chat panel that lives alongside the existing tabs.

**What the AI can see for every question:**
1. The full structured `psychological_profile` JSON
2. All 5 raw analysis passes (`raw_analysis.pass1`–`pass4` + final synthesis) — these are already stored
3. **A retrieval tool** it can call to pull supporting memories on demand

**Database changes:**
- Add a `profile_chats` table (thread per profile version) with messages stored alongside
- Ensure `psychological_profile.raw_analysis` includes `pass5` (currently only stores 1–4 — small fix)

**New edge function: `profile-chat`** (streaming SSE, Lovable AI Gateway, Gemini 2.5 Pro)

Flow per user message:
1. Load profile + raw passes into the system prompt
2. Expose two tools to the model:
   - `search_memories(query, limit)` → trigram search via existing `match_engrams` pattern, returns memory content + metadata + dates
   - `get_pass_excerpt(pass_name, topic)` → returns relevant slice of the raw analysis transcript
3. Model uses tools as needed, then answers with **inline citations** like `[memory #4]` or `[pass: shadow]`
4. Stream tokens to the client

**UI for the chat panel:**
- Collapsible side panel (toggle in profile header) or a new "Ask" tab
- Each AI message renders citations as expandable chips — click to see the actual memory text/pass excerpt that informed the claim
- Suggested starter prompts pulled from the profile itself: "Why did you say I'm conscientious?", "What evidence shows my attachment style?", "What blind spot should I sit with first?"
- System prompt frames the AI as a **wise, compassionate guide** — not a clinician — focused on actionable self-understanding

---

## Implementation Order (Granular Steps)

**Phase A — Import management (quick wins)**
1. Migration: add index on `memories(provenance->>'import_id')` for fast cascade deletes
2. New edge function `delete-import` with hard cascade
3. New `ImportDetailPanel` component in `MemoryView.tsx` — slides in from right when row clicked
4. Wire delete button + confirm dialog + toast
5. Add "Re-run profiling" button that calls existing `profile-deep-analysis` and shows polling state

**Phase B — Universal importer**
6. Create `src/lib/importAdapters/` with `chatgpt.ts`, `claude.ts`, `gemini.ts`, `grok.ts`, `xTweets.ts`, `xDMs.ts`, `generic.ts`, plus a shared `types.ts`
7. Add `jszip` dependency for zip uploads
8. Refactor `importStore.parseAndFilter` to dispatch via adapter registry
9. New edge function `import-detect` for unknown formats (Gemini Flash classifier)
10. Add tweet-extraction system prompt branch to `import-chatgpt` (or split into `import-process`)
11. Update `ImportView` UI: zip support, platform confirmation step, X archive dual-toggle, expanded export instructions

**Phase C — Profile chat**
12. Migration: create `profile_chats` and `profile_chat_messages` tables with RLS (owner-only)
13. Patch `profile-deep-analysis` to also persist `pass5` into `raw_analysis`
14. New edge function `profile-chat` with SSE streaming + 2-tool calling (`search_memories`, `get_pass_excerpt`)
15. New `ProfileChatPanel` component with streaming renderer + citation chips
16. Add toggle in `ProfileView` header to open the panel; persist conversation per profile version
17. Generate 4–6 starter prompts dynamically from the user's actual profile data

---

## Technical Notes

- **Cascade safety**: deletion goes through a single edge function with service role; client never issues raw deletes
- **Profiling concurrency**: `chat_imports.pipeline_stage` is reused as a lock — a re-run while one is in flight is blocked with a toast
- **Tweet extraction**: tweets are scored by length + engagement signals (if present in archive) + first-person pattern, capped at top 1000 to keep extraction tractable
- **Profile chat tool calls**: `search_memories` uses the existing `match_engrams` SQL function pattern but queries the `memories` table (trigram on `content`) — no new vector store needed
- **All AI calls** route through Lovable AI Gateway with `LOVABLE_API_KEY`; no user OpenRouter key consumed
- **No regressions** to the existing import pipeline — adapters wrap, they don't replace

---

## What This Unlocks

- Manage every import like a first-class object (delete, inspect, re-profile)
- Bring data from any AI platform — and from your social presence — into one unified self-portrait
- Have a real conversation with your own analysis: ask *why*, see the receipts, walk away with insight you can actually use

