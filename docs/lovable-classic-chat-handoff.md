# Lovable Handoff: Classic Chat Runtime

Send this to Lovable before publishing the Classic Chat slice:

```
Please pull latest `main` and deploy the Classic Chat / quiet Mnemos slice.

Required database migration:
- Apply `supabase/migrations/20260614000000_classic_chat_runtime.sql`.
- Confirm `public.threads` has:
  - `runtime_mode text not null default 'agent'` with CHECK values `classic | agent`
  - `selected_model text`
  - `memory_enabled boolean not null default true`
  - `continuity_summary text`
  - index `threads_user_runtime_updated_idx`

Required edge functions to deploy:
- `chat-multi`
- any bundled shared modules it imports, especially:
  - `_shared/classic-chat.ts`
  - `_shared/continuity/kernel.ts`
  - `_shared/continuity/write.ts`

Verification checklist:
1. Create a brand-new normal chat from `/chat`.
   - Expected: `threads.runtime_mode = 'classic'`.
   - Expected: user can select a model and the request to `chat-multi` includes `runtime_mode: "classic"` and `model: <selected model>`.
   - Expected: assistant message is persisted with `agent is null`.
2. Confirm Classic Chat uses quiet memory only.
   - Expected `chat-multi` logs show continuity loads without identity, hypomnema, skills, beliefs, emotional state, or pending revisions.
   - Expected post-turn continuity report queues `mnemos_encode` only.
   - Expected skipped reasons for `observer_watch`, `mnemos_dialectic`, `skills_distill`, `hypomnema_gate`, and `thread_agent_metadata` are `classic quiet runtime`.
3. Confirm quiet Mnemos lanes.
   - For an OpenAI model, expected memory write scopes include `classic:shared` and `classic:family:openai`.
   - For an Anthropic model, expected scopes include `classic:shared` and `classic:family:anthropic`.
4. Toggle Agent Mode on a Luca chat and send a message.
   - Expected request uses `runtime_mode: "agent"` / `agent_mode: "agent"`.
   - Expected Luca/custom-agent behavior remains unchanged, including tools/Forge only in Agent Mode.
5. Run smoke checks:
   - Model switch on an existing classic thread.
   - New custom-agent thread.
   - Onboarding handoff.
   - Companion migration handoff.
   - Existing pre-migration threads still behave as agent runtime because migration default is `agent`.
```

Do not publish until the migration and `chat-multi` deployment are both confirmed.
