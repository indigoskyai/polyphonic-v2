

# Conversation Data Upload & Deep Psychological Profiling System

## What This Builds

A full-page upload experience accessible from the Memory section of Settings (and via a new `/import` route) that lets users upload conversation exports from ChatGPT, Claude, and other platforms. The system runs a multi-stage AI analysis pipeline that builds a deep psychological profile — extracting personality traits, communication patterns, emotional tendencies, attachment styles, cognitive biases, values hierarchies, and narrative identity threads. The result feels like the AI has known the user for years.

## Current State

- Backend edge functions already exist: `import-chatgpt` (chunked extraction), `memory-synthesize` (narrative threads + identity profile), `extract-persona` (AI companion profiling), `clear-import` (cleanup)
- These write to a `memories` table and `chat_imports` tracking table (neither visible in current schema — likely from an older migration or the `memories` table was removed)
- No frontend UI exists for uploading — there is no import page, no upload button anywhere
- The Memory tab in Settings has memory system controls but no import section

## Database Changes

1. **Create `chat_imports` table** (if not present — the edge functions reference it):
   - `id`, `user_id`, `status` (pending/processing/completed/failed/cleared), `pipeline_stage`, `source_platform`, `total_conversations`, `processed_conversations`, `memories_created`, `questions_generated`, `conflicts_detected`, `file_size_bytes`, `created_at`, `completed_at`
   - RLS: users see own imports, service role full access

2. **Create `psychological_profile` table** — the deep profile output:
   - `id`, `user_id`, `identity_narrative` (text), `personality_dimensions` (jsonb — Big Five, attachment style, cognitive style), `communication_patterns` (jsonb), `emotional_landscape` (jsonb — triggers, coping mechanisms, baseline mood), `values_hierarchy` (jsonb), `relational_dynamics` (jsonb), `cognitive_tendencies` (jsonb — biases, decision-making patterns), `growth_edges` (jsonb — areas of active development), `shadow_patterns` (jsonb — blind spots, contradictions), `raw_analysis` (jsonb), `version`, `created_at`, `updated_at`
   - RLS: users own only

3. **Create `curiosity_questions` table** (referenced by import-chatgpt but may not exist):
   - `id`, `user_id`, `question`, `context`, `curiosity_score`, `status` (pending/shown/dismissed), `created_at`, `expires_at`

## New Edge Function: `profile-deep-analysis`

A new multi-pass analysis function that goes far beyond the existing `memory-synthesize`. It runs 5 specialized analysis passes using a powerful reasoning model:

1. **Linguistic Fingerprinting** — vocabulary richness, sentence complexity, hedging patterns, assertion strength, humor style, metaphor usage
2. **Psychological Profiling** — Big Five approximation, attachment style indicators, locus of control, cognitive complexity, emotional granularity
3. **Relational Mapping** — who they mention, how they talk about relationships, power dynamics, dependency patterns, social identity
4. **Values & Motivation Analysis** — implicit value hierarchy, intrinsic vs extrinsic motivations, what they optimize for, what they avoid
5. **Shadow Analysis** — contradictions between stated values and behavior, blind spots, recurring avoidance patterns, growth edges

Each pass uses the full memory corpus plus the outputs of previous passes (iterative deepening). Final output is synthesized into the `psychological_profile` table and stored as high-confidence engrams in the Mnemos system.

## Frontend: Import View (`/import`)

A dedicated full-page experience (also accessible from Settings > Memory tab):

1. **Upload Stage** — Drag-and-drop zone accepting `.json` (ChatGPT export), `.txt`, `.csv`. Platform auto-detection. File validation and size display. Support for ChatGPT format initially (the parser already exists), with placeholders for Claude/Google/generic.

2. **Processing Stage** — Real-time progress visualization:
   - Animated pipeline stages: Parsing → Extracting → Profiling → Synthesizing → Complete
   - Live counters: conversations processed, memories extracted, patterns found
   - Subtle particle animation (reusing EchoField in 'thinking' state)
   - Each stage shows what the AI is discovering in real-time (streaming insights)

3. **Results Stage** — The "magic moment":
   - Identity narrative displayed in elegant typography
   - Personality dimensions as minimal bar visualizations
   - Narrative threads as an interactive list
   - Key insights highlighted as "things only someone who really knows you would notice"
   - Curiosity questions the AI generated
   - Option to re-run analysis or clear import

## Pipeline Orchestration (Client-Side)

The frontend orchestrates the pipeline by calling edge functions in sequence:

```text
Upload JSON
  → Parse & chunk conversations (client-side)
  → POST each chunk to import-chatgpt (sequential, with progress)
  → POST to memory-synthesize (narrative threads)
  → POST to profile-deep-analysis (new — deep psychological profiling)
  → Display results
```

## File Changes Summary

| File | Change |
|------|--------|
| `supabase/migrations/new` | Create `chat_imports`, `psychological_profile`, `curiosity_questions` tables |
| `supabase/functions/profile-deep-analysis/index.ts` | New — 5-pass deep psychological analysis |
| `src/pages/ImportView.tsx` | New — Full upload + progress + results page |
| `src/App.tsx` | Add `/import` route |
| `src/components/Rail.tsx` | Add import nav icon |
| `src/pages/SettingsView.tsx` | Add "Import Conversations" button in Memory tab linking to `/import` |

## Technical Notes

- The `import-chatgpt` function already handles ChatGPT's tree-structured JSON format with linearization, chunking, dedup, and confidence capping — we reuse it entirely
- The new `profile-deep-analysis` function uses the user's OpenRouter key (same pattern as all other functions — no platform key)
- All analysis passes use `google/gemini-2.5-pro` or equivalent reasoning model for maximum depth
- Profile data is stored both as structured JSON (queryable) and as Mnemos engrams (retrievable by the chat system)
- The pipeline is fault-tolerant — each stage can fail independently without losing prior work

