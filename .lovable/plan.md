

# Luca Cloud — Full Rebuild Plan

## Summary

Replace the entire frontend and database with the Luca spec: a dark-mode-only multi-model AI chat app with two agents (Luca + Guardian), persistent Rail sidebar, Clockbar, Chat/Dashboard/Settings views, and OpenRouter integration. Clean slate database migration. The HTML reference file is the visual source of truth.

## Scope Adjustments from PRD

The PRD describes 4 agents (Luca, Vektor, Anima, Jerry). Per your direction:
- **Only Luca** (warm gold `#c9a87c`) as the primary chat agent
- **Guardian** (sage green `#8ca89c`, from the HTML reference) as an observer/meta-agent
- Remove Vektor, Anima, Jerry entirely from agent config, pills, model defaults, and DB schema
- Guardian is not a chat target pill — it observes. Luca is the default and only chat agent
- Input footer follows the HTML reference exactly (no multi-agent pill selector needed)

## What We Keep

- Supabase auth system (profiles, user_roles, has_role function, auto_assign_first_admin)
- user_api_keys table + encrypt/decrypt functions (for OpenRouter key storage)
- app_config table
- OPENROUTER_API_KEY secret (already configured)
- Storage buckets

## Database: Clean Slate Migration

**Drop all old tables** (except profiles, user_roles, user_api_keys, app_config):
- activity_events, beliefs, chat_imports, companion_profiles, conversations, curiosity_questions, daily_logs, emotional_history, emotional_state, entity_activity_log, entity_social_accounts, entity_task_queue, experimental_persona_config, extraction_rejections, journal_entries, memories, memory_conflicts, memory_connections, message_variants, messages, model_configs, observer_logs, reflection_jobs, system_prompts, thought_initiations, thought_stream, user_settings, user_skills

**Create new tables** (all with RLS `auth.uid() = user_id`):

1. **threads** — id, user_id, title, created_at, updated_at, pinned (bool default false), heat (text default 'warm')
2. **messages** — id, thread_id (fk threads), user_id, role (text), content (text), model (text), agent (text nullable — 'luca' or 'guardian'), thinking_content (text nullable), tokens_used (int), created_at, bookmarked (bool default false)
3. **agent_config** — id, user_id, agent_name (text default 'luca'), voice (text), system_prompt (text), default_model (text default 'anthropic/claude-sonnet-4'), personality (jsonb), created_at, updated_at
4. **cognitive_state** — id, user_id, modulators (jsonb), emotions (jsonb), beliefs (jsonb), updated_at. Realtime enabled.
5. **thought_stream** — id, user_id, type (text), content (text), trigger (text), salience (float), source (text), created_at. Realtime enabled.
6. **memory_events** — id, user_id, type (text), content (text), salience (float), created_at
7. **user_settings** — id, user_id, default_model (text), synthesis_style (text default 'conversational'), stream_responses (bool default true), show_thinking (bool default true), auto_title (bool default true), interface_density (text default 'default'), font_size (int default 14), show_timestamps (bool default true), show_agent_colors (bool default true), clockbar_visible (bool default true), created_at, updated_at

Enable realtime on cognitive_state, thought_stream, messages.

Trigger: auto-create user_settings on new user signup.

## Frontend: Complete Replacement

**Delete all existing pages and components** (except ui/ primitives). Build from scratch:

### Global CSS (`index.css`)
- Complete design token system from the PRD (all CSS custom properties)
- 8 `@property` declarations for breathing border
- All keyframe animations (breathe, ring states, clockbeat, murmur dots, shimmer)
- Font imports (Inter, JetBrains Mono)
- Dark mode only, antialiased

### Application Shell (`App.tsx`)
- Flex row layout: Rail (left) + Main Content (flex: 1) + Clockbar (bottom)
- Routes: `/` -> `/chat`, `/chat`, `/chat/:threadId`, `/dashboard`, `/settings`, `/auth/login`, `/auth/signup`
- Auth protection wrapper

### Components to Build

**Shell:**
- `Rail.tsx` — Collapsed (48px) / expanded (260px) with crossfade. Logo with ring states, thread dots, nav icons, search, thread list, new thread button, expand toggle
- `Clockbar.tsx` — Live clock with beating colon, day timeline, session bar

**Chat View:**
- `ChatView.tsx` — Header + messages container + input area
- `MessageList.tsx` — Scrollable message list with fadeIn, auto-scroll
- `Message.tsx` — Role label (with Luca gold color), markdown body, streaming cursor, action bar
- `ThinkingBlock.tsx` — 4-state expandable block with murmur dots, shimmer label, peek window
- `ChatInput.tsx` — Textarea with breathing border, auto-grow, input footer (matching HTML exactly), send/stop button crossfade

**Dashboard View:**
- `DashboardView.tsx` — Two tabs: Dashboard + Thoughts
- `CognitiveModulators.tsx` — 5 horizontal bar meters
- `MemoryCards.tsx` — 3-column grid cards
- `EmotionalState.tsx` — 6-dimension display
- `ThoughtStream.tsx` — Filterable thought feed with realtime

**Settings View:**
- `SettingsView.tsx` — 200px left nav + scrollable content
- 6 tabs: General, Models, Personality, Memory, Appearance, Account
- Form controls matching PRD specs

**Auth:**
- `LoginPage.tsx` — Email/password login at `/auth/login`
- `SignupPage.tsx` — Email/password signup at `/auth/signup`

### State Management
- Zustand stores: `useThreadStore`, `useCognitiveStore`, `useSettingsStore`, `useAuthStore`
- Realtime subscriptions for cognitive_state and thought_stream

### Edge Function: `chat` (rewrite)
- Simplified for single-agent (Luca) + OpenRouter
- Accepts thread_id, message content, model override
- Streams response via SSE
- Saves user + assistant messages to new messages table
- Uses user's OpenRouter API key (from user_api_keys) or fallback to server OPENROUTER_API_KEY secret

## Build Order (within a single full build)

1. Design tokens + global CSS + font imports
2. Database migration (drop old, create new)
3. Auth pages (login/signup)
4. App shell (Rail + Clockbar + routing)
5. Chat view (messages + input + thinking blocks)
6. Chat edge function (OpenRouter streaming)
7. Dashboard view (cognitive state + thoughts)
8. Settings view (all 6 tabs)

## Technical Details

- React 18 + TypeScript strict
- Zustand for client state (replaces React Context pattern)
- Tailwind CSS utilities + CSS custom properties (no raw values in components)
- All icons are inline SVGs per the PRD specs
- No emojis anywhere
- shadcn/ui base components where applicable
- React Router for routing

