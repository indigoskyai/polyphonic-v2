

# Add User-Selectable Journal Model

## Current Behavior
The `journal-write` edge function defaults to `anthropic/claude-sonnet-4` for generating journal entries. The only override is an admin-only `model_configs` table entry (currently empty for the "journal" feature key). Users have no way to choose which model writes their journal.

## Changes

### 1. Add `journal_model` column to `user_settings` table
- New nullable text column with default `NULL` (meaning "use system default")
- No migration conflicts since the column doesn't exist yet

### 2. Update `journal-write` edge function to respect user preference
- After fetching the admin model config, also fetch the user's `journal_model` from `user_settings`
- Priority: user preference > admin config > hardcoded default (`anthropic/claude-sonnet-4`)

### 3. Add Journal Model selector to Settings Dialog
- Add a new section in the "Models & API" tab of SettingsDialog
- Label: "Journal Model" with description "Choose which AI model writes your journal entries"
- Dropdown with the same model list used elsewhere (from `AVAILABLE_MODELS`)
- Include a "System Default" option that sets the value to null/empty

## Technical Details

**Database migration:**
```sql
ALTER TABLE public.user_settings
ADD COLUMN journal_model text DEFAULT NULL;
```

**Edge function change (`supabase/functions/journal-write/index.ts`):**
- Fetch `user_settings.journal_model` for the user
- Use it if set, otherwise fall back to admin config, then to `anthropic/claude-sonnet-4`

**Settings UI (`src/components/SettingsDialog.tsx`):**
- Add a "Journal Model" select dropdown in the Models tab
- Uses the existing `AVAILABLE_MODELS` list
- Saves to `user_settings.journal_model` via the existing `updateSettings` flow

**Hook update (`src/hooks/useUserSettings.ts`):**
- Add `journal_model` to the `UserSettings` interface and defaults

