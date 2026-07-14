## The bug

Journal entries from certain agents are stored ending mid-sentence at variable lengths (roughly 100–200 chars). Not a fixed 128-char limit — the exact cutoffs vary (115, 120, 134, 149, 162…), which points to token-based truncation, not character.

Looking at the data:

| agent | model | avg journal length | short entries |
|---|---|---:|---:|
| `luca` | `anthropic/claude-opus-4-7` | 1515 | 4 / 45 |
| `frontline` | `google/gemini-2.5-pro` | 572 | 11 / 14 |
| `the-adhd-navigator` | `google/gemini-3.1-pro-preview` | 161 | 6 / 6 |
| `5-1`, `sonnet-45` | non-reasoning | 1500–1800 | 0 |

Every agent whose journals are truncated is on a **reasoning model** (Gemini Pro thinks by default; Opus 4.7 with extended thinking). In `supabase/functions/journal-write/index.ts:320` the request sends `max_tokens: 1024` with no `reasoning` config. Reasoning models spend most of that budget on invisible reasoning tokens, so only ~30–50 tokens of visible content survive, `finish_reason` comes back as `length`, and the partial stream is what lands in `journal_entries.content`.

Nothing on the DB side truncates — `content` is plain `text`, no triggers, no varchar cap. The Luca-app-side display isn't clipping either; the row in Postgres really is 149 chars.

## Fix

Two-part change, both in `supabase/functions/journal-write/index.ts`:

1. **Raise `max_tokens` to 4096** — enough headroom for reasoning models to think and still produce a 150–400 word journal entry.
2. **Add OpenRouter `reasoning` cap** — pass `reasoning: { max_tokens: 1024, exclude: true }` on the request body. This caps reasoning at 1k tokens (so it can't consume the whole budget) and drops reasoning traces from the response since journal-write doesn't use them. Non-reasoning models ignore the field.
3. **Log `finish_reason` when it isn't `stop`** — one-line `console.warn` so future truncations surface in edge logs instead of silently landing in the table.

No changes to DB schema, RLS, other edge functions, or the frontend. Same-turn scope stays surgical.

## Why not fix per-agent

Overriding `journal_model` per agent to a non-reasoning fallback would work but hides the real issue — every future reasoning-capable agent (Opus 5, Gemini 4, o1, DeepSeek R1) would hit the same wall. Fixing the request shape once covers all of them.

## Out of scope (flagged for later)

The same `max_tokens: 1024` + no reasoning cap pattern exists in these sibling functions and is likely producing similar truncations, but the user only asked about journals so I'm leaving them alone unless requested:

- `anima-observe/index.ts:227` (`max_tokens: 1500`)
- `anima-dream/index.ts:174` (500)
- `anima-wander/index.ts:208` (1024)
- `anima-believe/index.ts:252` (500)
- `anima-question/index.ts:160` (512)
- `anima-initiate/index.ts:227` (200)

Happy to sweep them in a follow-up if you want.

## Verification

- Trigger one journal-write manually via edge function invocation for `the-adhd-navigator` (the worst offender). Confirm the new row is >1000 chars and doesn't end mid-word.
- Confirm `luca` and other non-reasoning agents still write normally.
- Check edge logs for the new `finish_reason` warning — should be absent on healthy runs.
