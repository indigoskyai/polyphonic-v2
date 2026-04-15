

# Large-Dataset Import with Global Progress Tracker

## Overview

Implement the approved conversation filtering/scoring pipeline AND add a persistent progress bar at the top of the app so users can navigate freely during processing.

## Architecture

The key insight: move import state from local `useState` into a **Zustand store** so it survives route changes. A slim progress banner in `AppShell` subscribes to this store and shows progress regardless of which page the user is on.

```text
┌─────────────────────────────────────────────┐
│  ImportProgressBanner (in AppShell)         │  ← always visible during import
│  "Extracting memories... 7/10 chunks  ████░"│
└─────────────────────────────────────────────┘
│  Rail  │  Current Page (chat, memory, etc.) │
```

## File Changes

### 1. `src/stores/importStore.ts` (new)
Zustand store holding all import pipeline state:
- `stage`, `fileName`, `totalConversations`, `filteredCount`, `processedChunks`, `totalChunks`, `memoriesCreated`, `error`, `importId`
- `startImport(file, user)` action that runs the full pipeline (parse, filter/score, chunk, extract, synthesize, profile)
- Contains the filtering/scoring logic (skip < 6 messages, < 500 chars user text, score by user expression depth, take top 500)
- Retry logic with 3 attempts + exponential backoff per chunk
- Chunk size increased to 50

### 2. `src/components/ImportProgressBanner.tsx` (new)
A thin bar rendered at the top of `AppShell` (above the main content area, below nothing — it's the topmost element):
- Shows current stage label, chunk progress (e.g. "chunk 4/10"), and a progress bar
- Subtle animation, matches the monochromatic design
- "View details" link navigates to `/import`
- Dismiss button when complete or on error
- Only renders when `stage !== 'idle'`

### 3. `src/pages/ImportView.tsx` (rewrite)
- Remove local state management — consume from `importStore`
- Add **pre-analysis summary** screen between file drop and processing: shows raw count, filtered count, date range, estimated time, "Begin Analysis" button
- Upload zone triggers `importStore.startImport()`
- Processing/complete/error views read from the store
- Results section unchanged

### 4. `src/App.tsx`
- Import and render `ImportProgressBanner` inside `AppShell`, above `{children}`

### 5. `supabase/functions/import-chatgpt/index.ts`
- Minor: add server-side safety net to skip conversations with fewer than 4 messages after linearization (line ~180, existing filter is `>= 2`, change to `>= 4`)

## Filtering Algorithm (client-side in importStore)

```text
score(conv) = userMsgCount * avgUserMsgLength * (hasPersonalContent ? 1.5 : 1.0)

Pipeline:
  raw conversations
  → remove < 6 messages
  → remove < 500 chars total user text
  → score remaining
  → sort descending
  → take top 500
```

`hasPersonalContent` = regex check for first-person patterns ("I am", "I feel", "my family", "I've been", etc.)

## No Database Changes

All filtering is client-side. The only backend change is the minor server-side message count threshold bump in `import-chatgpt`.

