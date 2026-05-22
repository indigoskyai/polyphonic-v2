## What I'll do

1. **Harden `supabase/functions/agent-config-save/index.ts`** — replace the `name`/`role` merge with the explicit fallback you specified:
   - `name`: trimmed body value if non-empty → else trimmed existing value if non-empty → else `agentId`.
   - `role`: if body provides it, trimmed value or `"custom"` → else trimmed existing value if non-empty → else `"custom"`.
   - Never writes null or blank.
2. **Deploy** `agent-config-save` and `agent-identity-save` via `supabase--deploy_edge_functions`.
3. **Skip DB cleanup.** I checked `agent_configs` for rows with null/blank `name` or `role` — zero rows. No SQL needed.
4. **Verify** by calling `agent-config-save` from the preview session against `test-companion` with a small prompt-only patch, confirm 200, then ask you to run the UI acceptance (save → refresh → identity doc save).
5. If anything still 500s, pull `supabase--edge_function_logs` for the offending function and paste the exact error.

## Files touched

- `supabase/functions/agent-config-save/index.ts` (merge block only)

No migration, no other files.