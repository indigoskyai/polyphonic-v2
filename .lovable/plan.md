# Add GPT-5.1 + Claude Sonnet 4.5 to all model selectors

## Audit results

Both models are already wired correctly on the backend in `supabase/functions/_shared/models.ts`:
- `anthropic/claude-sonnet-4.5` — registered as Anthropic-style reasoning model
- `openai/gpt-5.1` — registered as OpenAI-style reasoning model

Both models are already present in two of the four user-facing model selectors:
- `src/pages/settings/GeneralSettings.tsx` (default chat model picker) — present
- `src/pages/settings/ModelsSettings.tsx` (model catalog / ensemble picker) — present

They are **missing** from the other two selectors used when creating or editing agents:
- `src/components/settings/CreateAgentModal.tsx` (`MODEL_OPTIONS`)
- `src/pages/settings/AgentDetail.tsx` (`MODEL_OPTIONS`)

## Changes

1. **`src/components/settings/CreateAgentModal.tsx`** — extend `MODEL_OPTIONS` to include:
   - `{ value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' }`
   - `{ value: 'openai/gpt-5.1', label: 'GPT-5.1' }`
   Insert them in the natural order alongside the existing Sonnet/GPT entries.

2. **`src/pages/settings/AgentDetail.tsx`** — same two additions to its `MODEL_OPTIONS` list.

No backend or store changes needed — `agentSettingsStore` normalization already passes unknown-but-valid model ids through unchanged, and the OpenRouter agent runtime + reasoning param builder both already handle these two ids.

## Verification

- Reload `/settings/agents` and `/settings/agents/<id>`: confirm both new options appear in the dropdowns.
- Select Sonnet 4.5 on one agent and GPT-5.1 on another, save, and run a quick chat turn against each to confirm OpenRouter accepts the id and the reasoning params apply (Anthropic `thinking.budget_tokens` for Sonnet 4.5, OpenAI `reasoning.effort` for GPT-5.1).
