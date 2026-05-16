
## Goal

After a user signs in (Google or email/password), route them to a dedicated `/access` gate page styled like the existing login page. They connect a Solana wallet (Wallet Standard — covers Phantom, Solflare, Backpack, etc.), sign a one-time nonce to prove ownership, and the server checks they hold ≥ $50 USD of $MNEMOS (mint `BMcReKHFc5KssDgDisZBq3YmJe5RdjnBUumxpXpRpump`) using the Jupiter Price API. Verification is cached for 24 hours; admins bypass.

## User flow

```text
Login (Google / email) ──▶ AuthGate
                            │
                  has valid (≤24h) verification? ──yes──▶ /chat
                            │ no
                            ▼
                        /access page
                            │
              [Connect Wallet]  (Wallet Standard modal)
                            │
              [Sign verification message]  (nonce + timestamp)
                            │
              POST verify-token-gate edge function
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
       balance × price ≥ $50         shortfall
              │                           │
       insert token_gate_              show: balance, USD value,
       verifications row                shortfall, "Buy on Jupiter" link,
              │                           [Re-check] button
              ▼
            /chat
```

## Architecture

### Frontend
- **`src/pages/AccessGatePage.tsx`** — new page at `/access`. Reuses LoginPage visual tokens (`--bg-deep`, `--font-sans`, pill buttons). Three states: idle, connecting, verifying, success, denied.
- **`src/lib/solanaWallet.ts`** — thin wrapper around `@solana/wallet-adapter-base` + `@solana/wallet-standard-wallet-adapter-react` for wallet discovery, connect, and `signMessage`.
- **`src/components/access/WalletPickerModal.tsx`** — lists detected wallets (Phantom, Solflare, Backpack, others surfaced by Wallet Standard).
- **`src/stores/tokenGateStore.ts`** — Zustand store: `{ status, lastVerifiedAt, balance, usdValue, walletAddress }`. Hydrates from Supabase on mount.
- **`src/components/auth/AuthGate.tsx`** — route guard wrapping protected routes. Checks `token_gate_verifications` row newer than 24h OR admin role; otherwise redirects to `/access`.
- **`src/App.tsx`** — add `/access` route (public-when-authed); wrap `/chat`, `/mind`, `/memory`, etc. with `<AuthGate>`.

### Backend (Lovable Cloud)

**New table `token_gate_verifications`**
- `user_id uuid` (FK to auth.users, PK)
- `wallet_address text not null`
- `balance numeric not null` (raw $MNEMOS held)
- `usd_value numeric not null`
- `price_used numeric not null` (24h avg USD per $MNEMOS at verification)
- `verified_at timestamptz not null default now()`
- `expires_at timestamptz not null` (verified_at + 24h)
- RLS: user can `select` their own row; only edge function (service role) writes.

**New table `token_gate_nonces`** (short-lived, for sign-in-with-Solana replay protection)
- `nonce text primary key`
- `user_id uuid not null`
- `created_at timestamptz default now()` (delete after 10 min via cron or on consume)

**New edge function `token-gate-nonce`** — `POST` → returns `{ nonce, message }` where `message` is `"Verify $MNEMOS holding for Polyphonic\n\nNonce: <nonce>\nIssued: <iso>"`. Requires JWT.

**New edge function `verify-token-gate`** — `POST { walletAddress, signature, nonce }`:
  1. Validate JWT → `user_id`.
  2. Look up nonce row; reject if missing/expired/wrong user. Delete on consume.
  3. Verify ed25519 signature of `message` matches `walletAddress` (use `tweetnacl` via `npm:tweetnacl`).
  4. Fetch SPL balance of $MNEMOS for `walletAddress` via Solana RPC (`getTokenAccountsByOwner` filtered by mint, sum `uiAmount`). Use public RPC `https://api.mainnet-beta.solana.com` (configurable via `SOLANA_RPC_URL` secret if rate-limited later).
  5. Fetch 24h avg price from Jupiter Price API v2: `https://lite-api.jup.ag/price/v3?ids=BMcReKHFc5KssDgDisZBq3YmJe5RdjnBUumxpXpRpump`. Use returned `usdPrice` (Jupiter's price is already a recent VWAP; we'll store it as our reference). Cache server-side per-day in `app_config` to keep it stable across users for the calendar day.
  6. Compute `usdValue = balance * price`. If `>= 50`, upsert `token_gate_verifications` with `expires_at = now() + 24h`. Return `{ allowed, balance, usdValue, price, shortfall }`.

**Admin bypass**: AuthGate calls `has_role(auth.uid(), 'admin')` first; admins skip wallet entirely.

### Dependencies (frontend)
- `@solana/web3.js`
- `@solana/wallet-standard-wallet-adapter-react`
- `@solana/wallet-adapter-react` + `@solana/wallet-adapter-react-ui` (for the picker modal styling — we'll restyle to match)
- `bs58` (encode signature/pubkey)

### Edge function deps (Deno)
- `npm:tweetnacl` for signature verification
- `npm:bs58` for decoding signature
- `npm:@solana/web3.js` for `Connection.getParsedTokenAccountsByOwner`

## Security notes
- Nonce required + single-use → prevents replay
- Signature verified server-side → prevents claiming someone else's wallet
- Price cached server-side daily → can't be manipulated per-request
- RLS on verifications table → users can't insert/update their own row
- 24h grace period is intentional (per spec) — if user sells mid-day they keep access until midnight UTC re-check

## Open questions to resolve during build
- If Jupiter price endpoint is rate-limited or returns null for this mint, fall back to Birdeye (would need `BIRDEYE_API_KEY` secret). Will surface only if it actually fails in testing.

## What I'll need from you after plan approval
- Confirm OK to add the listed npm dependencies
- I'll request a `SOLANA_RPC_URL` secret only if the public RPC rate-limits us during testing (start without it)

## Files to create
- `src/pages/AccessGatePage.tsx`
- `src/components/auth/AuthGate.tsx`
- `src/components/access/WalletPickerModal.tsx`
- `src/lib/solanaWallet.ts`
- `src/stores/tokenGateStore.ts`
- `supabase/functions/token-gate-nonce/index.ts`
- `supabase/functions/verify-token-gate/index.ts`

## Files to edit
- `src/App.tsx` — add `/access` route + wrap protected routes in `<AuthGate>`
- `src/pages/LoginPage.tsx` + `SignupPage.tsx` — redirect to `/access` instead of `/chat` (AuthGate handles forwarding to `/chat` if already verified)
