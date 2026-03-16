# Supabase Setup Guide

This document describes everything needed to connect the polyphonic-anima app to its Supabase backend.

**Supabase Project**: `kknchdnrujzheulqzowv`
**URL**: `https://kknchdnrujzheulqzowv.supabase.co`

---

## 1. Database Migrations

Run all 37 migration files in `supabase/migrations/` in order (sorted by filename timestamp). The old schema has been dropped — this is a fresh setup.

These migrations create the following tables:
- `conversations`, `messages` — chat system
- `memories`, `memory_conflicts` — tiered memory with decay
- `journal_entries` — auto-generated journal
- `user_settings`, `profiles`, `user_roles` — user config
- `model_configs`, `system_prompts` — admin-managed AI config
- `curiosity_questions` — auto-generated follow-up questions
- `generated_images` — gallery
- `chat_imports`, `companion_profiles`, `extraction_rejections` — ChatGPT import
- `experimental_persona_config` — persona experiments
- `user_api_keys` — encrypted OpenRouter key storage
- `beliefs`, `emotional_state`, `emotional_history` — inner life
- `observer_logs`, `thought_initiations`, `thought_stream` — cognition
- `daily_logs`, `activity_events` — process tracking

All tables have Row Level Security (RLS) enabled with user-isolation policies.

## 2. Required Extensions

Enable these PostgreSQL extensions (Database → Extensions in dashboard):

- **`pg_net`** — Required for the resonance cascade system. The `trigger_resonance()` function in migration `20260312100000_activity_gate_and_resonance.sql` uses `net.http_post()` to chain cognitive processes.
- **`pg_cron`** — Required for scheduled background jobs (journal generation, memory decay, etc.)
- **`pgsodium`** — Required for API key encryption (`save_user_api_key`, `decrypt_user_api_key` functions)

## 3. Edge Functions

Deploy all 21 edge functions from `supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `chat` | Main conversation endpoint (streaming, memory, emotional context) |
| `memory-extract` | Extract memories from conversations |
| `memory-reflect` | Reflective memory processing |
| `memory-synthesize` | Synthesize memory insights |
| `memory-decay` | Time-based memory staleness updates |
| `journal-write` | Generate introspective journal entries |
| `journal-cron` | Scheduled journal generation |
| `generate-image` | Image generation via OpenRouter |
| `import-chatgpt` | Parse ChatGPT JSON exports |
| `clear-import` | Reset import state |
| `extract-persona` | Extract AI companion persona from imports |
| `anima-think` | Background thinking process |
| `anima-initiate` | Proactive thought initiation |
| `anima-dream` | Dream generation from memory fragments |
| `anima-question` | Curiosity question generation |
| `anima-reflect` | Deep reflection on beliefs and patterns |
| `anima-observe` | External observer (multi-model consensus) |
| `anima-consolidate` | Consolidate insights into beliefs |
| `anima-connect` | Connect related memories and thoughts |
| `anima-emotional-state` | Update 6-dimension emotional state |
| `anima-believe` | Extract and track beliefs |

The `_shared/` directory contains shared modules (not deployed as functions):
- `cors.ts` — CORS configuration
- `activity-gate.ts` — Activity signal evaluation
- `emotional-context.ts` — Emotional state loading/formatting

All functions have `verify_jwt = false` in `supabase/config.toml` (they handle auth internally).

## 4. Edge Function Secrets

Set these secrets for edge functions:

| Secret | Value | Purpose |
|--------|-------|---------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key (`sk-or-...`) | Fallback LLM API key for users without their own key |

The following are auto-provided by Supabase (no action needed):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 5. Database Configuration for Inner Life

The resonance cascade triggers need the Supabase URL and service role key. Since `ALTER DATABASE SET` is blocked in Lovable Cloud, we use an `app_config` table instead (created by migration `20260315060000_config_table_workaround.sql`).

**Insert the config values** (run in SQL Editor):

```sql
INSERT INTO app_config (key, value) VALUES
  ('supabase_url', 'https://kknchdnrujzheulqzowv.supabase.co'),
  ('service_role_key', '<your service role key from Supabase dashboard>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Without these values, the `trigger_resonance()` and `trigger_emotional_resonance()` functions (which chain cognitive processes when high-salience thoughts are created or emotional shifts occur) will silently skip.

## 6. Storage

Create a storage bucket:

| Bucket | Access | Purpose |
|--------|--------|---------|
| `generated-images` | Private | Stores AI-generated images. Functions create signed URLs for access. |

## 7. Authentication

### Providers to Enable
- **Email/Password** — Primary auth method
- **Google OAuth** — Optional but recommended

### Auth Settings
- Add these to **Redirect URLs**:
  - `https://polyphonic.chat`
  - `https://polyphonic.chat/**`
  - The Lovable preview URL for this project
  - `http://localhost:8080` (for local development)

### Email Templates
Customize verification and password reset emails with Polyphonic branding (optional).

## 8. Cron Jobs (Optional — for Inner Life)

These scheduled jobs power the autonomous cognition system. Set up via pg_cron or Supabase dashboard:

```sql
-- Journal generation (daily at 4 AM UTC)
SELECT cron.schedule('journal-cron', '0 4 * * *',
  $$SELECT net.http_post('https://kknchdnrujzheulqzowv.supabase.co/functions/v1/journal-cron',
    '{}', 'application/json',
    ARRAY[http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key'))]
  )$$
);

-- Memory decay (daily at 5 AM UTC)
SELECT cron.schedule('memory-decay', '0 5 * * *',
  $$SELECT net.http_post('https://kknchdnrujzheulqzowv.supabase.co/functions/v1/memory-decay',
    '{}', 'application/json',
    ARRAY[http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key'))]
  )$$
);
```

Additional anima cron jobs (can be added later):
- `anima-emotional-state` — every 4 hours
- `anima-think` — every 2 hours
- `anima-observe` — every 6 hours
- `anima-dream` — daily
- `anima-heartbeat` — every 15 minutes (lightweight liveness check, triggers activity-gated processes)

### Heartbeat Cron

The heartbeat function is a lightweight ping that checks for active users and triggers background cognitive processes only when there's recent activity. Schedule it at a high frequency since it short-circuits quickly when idle:

```sql
-- Heartbeat (every 15 minutes)
SELECT cron.schedule('anima-heartbeat', '*/15 * * * *',
  $$SELECT net.http_post('https://kknchdnrujzheulqzowv.supabase.co/functions/v1/anima-heartbeat',
    '{}', 'application/json',
    ARRAY[http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key'))]
  )$$
);
```
