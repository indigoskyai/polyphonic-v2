## Targeted pre-publish security cleanup (v2 — with collision retry + test cleanup)

### 1. Patch — crypto-secure pairing code RNG + insert retry

File: `supabase/functions/openclaw-pair/index.ts`

**1a. Replace `generateCode`** with a CSPRNG + rejection-sampled 6-digit generator:

```ts
function generateCode(): string {
  // 6-digit code (0..999_999). Reject samples >= largest multiple of RANGE
  // that fits in a Uint32 to eliminate modulo bias.
  const RANGE = 1_000_000;
  const MAX = Math.floor(0x1_0000_0000 / RANGE) * RANGE;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= MAX);
  return (n % RANGE).toString().padStart(6, "0");
}
```

**1b. Wrap the `issue` insert in a small retry loop** to absorb rare PK collisions on `openclaw_pairing_codes.code`:

```ts
const expires = new Date(Date.now() + 15 * 60_000).toISOString();
const MAX_ATTEMPTS = 5;
let code = "";
let lastErr: unknown = null;
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  code = generateCode();
  const { error } = await admin.from("openclaw_pairing_codes").insert({
    code, user_id: userId, expires_at: expires,
  });
  if (!error) { lastErr = null; break; }
  // Postgres unique_violation = 23505. Only retry on that; otherwise bail.
  const pgCode = (error as { code?: string }).code;
  if (pgCode !== "23505") { lastErr = error; break; }
  lastErr = error;
}
if (lastErr) throw lastErr;
```

UX is unchanged: still a single 200 response with `{ code, expires_at, ttl_seconds: 900 }`. Collisions are exceedingly rare given live codes expire in 15 min; 5 attempts is a generous ceiling.

No other changes to the file. `generateDeviceToken` already uses `crypto.getRandomValues` and stays as-is.

### 2. Deploy + verify

- Deploy `openclaw-pair`.
- Smoke test:
  1. `POST /openclaw-pair?action=issue` with preview user bearer → expect 200, 6-digit `code`, `expires_at`, `ttl_seconds: 900`.
  2. `POST /openclaw-pair?action=claim` body `{ code, device_name: "rng-smoke", platform: "test", bridge_version: "0.0.0-smoke" }` → expect 200 with `device_id`, `user_id`, `device_token`.
  3. Replay the same code → expect 400 "Invalid or used code".
- Confirm via `supabase--read_query`:
  - `openclaw_pairing_codes` row has `consumed_device_id` set.
  - `openclaw_devices` row exists with populated `device_token_hash` and `name = 'rng-smoke'`.

### 3. Test data cleanup (production-safe)

After smoke test passes, remove the seeded rows via `supabase--insert`:

```sql
DELETE FROM public.openclaw_devices
 WHERE name = 'rng-smoke' AND bridge_version = '0.0.0-smoke';

DELETE FROM public.openclaw_pairing_codes
 WHERE consumed_device_id IS NULL
   AND user_id = '<preview-user-id>'
   AND created_at > now() - interval '10 minutes'
   AND consumed_at IS NULL;
```

(Scoped tightly by the test marker fields + recency + preview user_id so production data is untouched. The claimed pairing-code row cascades / is harmless to leave, but we'll delete it too if it's still around and matches the test device's `consumed_device_id`.)

### 4. Three findings we are NOT changing (verify only)

- **agent_configs**: confirm no broad authenticated INSERT policy exists (`pg_policies` lookup) and that agent create/edit still flows through `agent-config-save`.
- **app_config**: confirm an authenticated (non-service) bearer cannot `SELECT` from it.
- **cron_health**: confirm `record_cron_run` continues to write rows; policies remain service-role only.

### 5. Scanner hygiene

- Re-run `security--get_scan_results` and report remaining items.
- `mark_as_fixed` the pairing-code RNG finding with a note covering CSPRNG + rejection sampling + unique-violation retry.
- `ignore` (with rationale) the three explicitly-accepted findings: `agent_configs` INSERT, `app_config` SELECT, `cron_health` writes.
- Update `@security-memory` to record:
  - Pairing codes use CSPRNG with rejection sampling and a small insert-retry loop for PK collisions.
  - `agent_configs` writes are gated by the `agent-config-save` edge function (entitlement enforcement); broad authenticated INSERT must not be added.
  - `app_config` is service-role only (holds `service_role_key`, `api_key_passphrase`, `supabase_url`).
  - `cron_health` is written via `record_cron_run` (SECURITY DEFINER) / service role only; no client write policies.

### Report back

- RNG + retry patch diff summary.
- `openclaw-pair` deploy status.
- Issue / claim / replay smoke-test results.
- Test row cleanup confirmation (rows deleted, counts).
- Post-patch scanner finding list.
- Confirmation: agent_configs unchanged + agent create/edit works; app_config unreadable to authenticated users; cron_health still records runs.

### Out of scope
- Any policy/GRANT change on `agent_configs`, `app_config`, `cron_health`.
- Any change to `generateDeviceToken`, token hashing, or pairing schema.
- Any bulk "fix all" security action.
