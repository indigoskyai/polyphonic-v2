

## Plan: Fix Chat Edge Function Timeout

### Problem
The chat edge function does ~15-25 seconds of blocking database work (auth, rate limits, memory retrieval, emotional state, beliefs, persona config, system prompt assembly) **before** returning any HTTP response. By the time the SSE stream starts, the Supabase edge function timeout (typically 60s) has already consumed a large chunk, and tool-calling flows (web search, URL reading) that add another 15-30 seconds frequently hit the wall.

For tool-capable models, the `ReadableStream` is created at line 968 but not returned until line 1124 — and all the heavy DB work (lines 615-895) runs before that. For non-tool models, the streaming response isn't returned until line 1174, after all DB work completes.

### Solution: Stream-First Architecture
Return the SSE `ReadableStream` response to the client **immediately** after auth + input validation + rate-limit check (the bare minimum that needs a normal HTTP response). Move all heavy work inside the stream's `start()` callback, with periodic heartbeat/status events to keep the connection alive.

### Implementation

**Single file change:** `supabase/functions/chat/index.ts`

#### What stays before the stream (fast path, <2s):
1. CORS preflight
2. Auth check (getClaims)
3. Request body parsing + input validation
4. Rate-limit check (decrypt API key + daily message count) — these are fast single-row queries already batched in Batch 1

#### What moves inside the stream:
1. System prompt loading (`system_prompts`, `model_configs`)
2. Persona config (`experimental_persona_config`)
3. User profile injection
4. Memory retrieval (the heaviest operation — 200-row fetch + scoring)
5. Curiosity questions, companion profiles, conflict counts
6. Emotional state, beliefs, thought initiations
7. Model identity preamble
8. Message truncation
9. OpenRouter API calls (both tool-calling and streaming)

#### Heartbeat mechanism:
- Send SSE comment lines (`: heartbeat\n\n`) every 5 seconds during DB work phases
- Send `{ "tool_status": "loading" }` at start so the client shows a loading indicator
- The client already handles `tool_status` events gracefully

#### Structural changes:
- Both tool-capable and non-tool-capable models will use the same `ReadableStream` wrapper
- The existing tool-calling flow (phases 1-3) stays the same, just runs inside the stream
- For non-tool models, the OpenRouter streaming response chunks get forwarded through the same stream

#### Heartbeat detail:
```text
Client sends message
  → Edge function returns SSE Response in ~1s
  → Stream emits: { tool_status: "loading" }
  → DB work begins (memory, beliefs, emotional state...)
  → Every 5s: ": heartbeat\n\n" (SSE comment, keeps connection alive)
  → DB work complete
  → Stream emits: { tool_status: "thinking" } (if tool-capable)
  → OpenRouter call(s) + tool execution
  → Stream forwards response chunks
  → Stream emits: "data: [DONE]\n\n"
```

### Risk Assessment
- **Low risk**: The client SSE parser already skips lines that don't start with `data:`, so SSE comment heartbeats are naturally ignored
- **No client changes needed**: The `tool_status` events are already handled
- The `memory_tier` field from request body is available before stream starts, so memory retrieval config is ready

### After code change:
- Redeploy the `chat` edge function

