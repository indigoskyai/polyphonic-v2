# Luca Private Beta Download Gate

The public landing page shows a **Download Luca** button. It opens a passphrase
dialog and calls the public Supabase Edge Function `luca-download`.

## Required Supabase secrets

Set these on the production Supabase project:

- `LUCA_DOWNLOAD_PASSPHRASE` — the private beta passphrase.
- `LUCA_DOWNLOAD_FILE_NAME` — optional, defaults to `Luca.dmg`.

Use one of these delivery modes:

### Preferred: private Supabase Storage

Store the notarized DMG in a private Supabase Storage bucket, then set:

- `LUCA_DOWNLOAD_STORAGE_BUCKET`
- `LUCA_DOWNLOAD_STORAGE_PATH`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The edge function creates a 15-minute signed download URL after the passphrase is
accepted.

### Fallback: external URL

Set:

- `LUCA_DOWNLOAD_URL`

This still hides the URL until the passphrase is accepted, but anyone who gets
the returned URL can reuse or share it if the host allows it. Use private
storage for the beta when possible.

## Deploy

Deploy `supabase/functions/luca-download` with JWT verification disabled, as
configured in `supabase/config.toml`.

The function never stores passwords and never exposes the passphrase to the
browser bundle.
