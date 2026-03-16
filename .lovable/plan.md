

## Plan: Fix Build Errors & Deploy New Edge Functions

### Errors to Fix

**4 files need changes:**

#### 1. `supabase/functions/anima-heartbeat/index.ts`
- **Import fix**: Change `corsHeaders` import to `getCorsHeaders` (the shared cors module exports a function, not a constant)
- **Update all CORS usages**: Replace `corsHeaders` with `getCorsHeaders(req)` throughout
- **Fix `logActivity` calls (7 occurrences)**: The shared `logActivity` signature is `(supabase, userId, entry)` but heartbeat calls it as `(supabase, { user_id, ... })`. Extract `user_id` as the second arg and pass the rest as the entry object, mapping `process_type`/`action_type`/`summary`/`metadata` to the `ActivityEntry` interface fields (`type`, `title`, `summary`, `content`)

#### 2. `supabase/functions/chat/index.ts` (line 829)
- Add type annotation: `(word: string)` to fix implicit `any` error

#### 3. `src/pages/Reflections.tsx` (lines 73, 166)
- Replace `.catch()` chains with try/catch or `.then()` error handling since the Supabase query builder returns `PromiseLike` which doesn't have `.catch()`
- Line 73: Remove `.catch(...)`, handle error from `.then()` result
- Line 166: Remove `.catch(() => {})`, wrap in try/catch or just use `.then()`

#### 4. `supabase/functions/anima-social-moltbook/index.ts` and `supabase/functions/anima-social-x/index.ts`
- These use inline `corsHeaders` constant (not the shared module) — no changes needed, they'll deploy as-is

### Deploy Steps
After fixing build errors:
1. Deploy new: `anima-heartbeat`, `anima-social-moltbook`, `anima-social-x`
2. Redeploy: `chat`

