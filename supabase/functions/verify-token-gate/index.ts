import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@6.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MNEMOS_MINT = 'BMcReKHFc5KssDgDisZBq3YmJe5RdjnBUumxpXpRpump';
const MIN_USD = 50;
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SOLANA_RPC = Deno.env.get('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
const PRICE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour server-side cache

let priceCache: { price: number; fetchedAt: number } | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { walletAddress, signature, nonce } = body as {
      walletAddress?: string;
      signature?: string;
      nonce?: string;
    };

    if (!walletAddress || !signature || !nonce) {
      return json({ error: 'walletAddress, signature, and nonce required' }, 400);
    }

    // 1. Consume nonce
    const { data: nonceRow, error: nonceErr } = await supabase
      .from('token_gate_nonces')
      .select('user_id, created_at, message')
      .eq('nonce', nonce)
      .maybeSingle();
    if (nonceErr || !nonceRow) return json({ error: 'Invalid or expired challenge' }, 400);
    if (nonceRow.user_id !== userId) return json({ error: 'Nonce mismatch' }, 400);
    const ageMs = Date.now() - new Date(nonceRow.created_at).getTime();
    if (ageMs > 10 * 60 * 1000) {
      await supabase.from('token_gate_nonces').delete().eq('nonce', nonce);
      return json({ error: 'Challenge expired' }, 400);
    }
    // Use the exact message that was signed (stored at issue time)
    const message = (nonceRow as any).message
      ?? `Verify $MNEMOS holding for Polyphonic\n\nNonce: ${nonce}\nIssued: ${new Date(nonceRow.created_at).toISOString()}`;

    // 2. Verify signature
    let pubkeyBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    try {
      pubkeyBytes = bs58.decode(walletAddress);
      signatureBytes = bs58.decode(signature);
    } catch {
      return json({ error: 'Invalid wallet or signature encoding' }, 400);
    }
    const messageBytes = new TextEncoder().encode(message);
    const ok = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
    if (!ok) {
      // Best-effort delete nonce on failed attempt
      await supabase.from('token_gate_nonces').delete().eq('nonce', nonce);
      return json({ error: 'Signature verification failed' }, 400);
    }

    // 3. Fetch SPL balance for $MNEMOS
    const balance = await fetchMnemosBalance(walletAddress);

    // 4. Fetch USD price (cached)
    const price = await fetchMnemosPrice();
    const usdValue = balance * price;
    const shortfall = Math.max(0, MIN_USD - usdValue);
    const allowed = usdValue >= MIN_USD;

    // 5. Consume nonce
    await supabase.from('token_gate_nonces').delete().eq('nonce', nonce);

    // 6. Upsert verification if allowed
    if (allowed) {
      const verifiedAt = new Date();
      const expiresAt = new Date(verifiedAt.getTime() + 24 * 60 * 60 * 1000);
      const { error: upsertErr } = await supabase
        .from('token_gate_verifications')
        .upsert({
          user_id: userId,
          wallet_address: walletAddress,
          balance,
          usd_value: usdValue,
          price_used: price,
          verified_at: verifiedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        });
      if (upsertErr) {
        console.error('[verify-token-gate] upsert failed', upsertErr);
        return json({ error: 'Could not persist verification' }, 500);
      }
    }

    return json({ allowed, balance, usdValue, price, shortfall });
  } catch (e) {
    console.error('[verify-token-gate] error', e);
    console.error('verify-token-gate error:', e);
    return json({ error: 'Internal server error' }, 500);
  }
});

async function fetchMnemosBalance(owner: string): Promise<number> {
  // Query both SPL token program and Token-2022 program
  const programs = [SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  let total = 0;
  for (const programId of programs) {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          owner,
          { mint: MNEMOS_MINT },
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) continue;
    const data = await res.json();
    const accounts = data?.result?.value ?? [];
    for (const a of accounts) {
      const amt = a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof amt === 'number') total += amt;
    }
    // Most $MNEMOS will live under the standard SPL token program; if first
    // call returns accounts, we don't need the 2022 fallback usually — but
    // looping is cheap and safer.
    if (total > 0) break;
  }
  return total;
}

async function fetchMnemosPrice(): Promise<number> {
  const now = Date.now();
  if (priceCache && now - priceCache.fetchedAt < PRICE_CACHE_TTL_MS) {
    return priceCache.price;
  }
  // Jupiter Price API v3
  const url = `https://lite-api.jup.ag/price/v3?ids=${MNEMOS_MINT}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Jupiter price fetch failed: ${res.status}`);
  const data = await res.json();
  const entry = data?.[MNEMOS_MINT] ?? data?.data?.[MNEMOS_MINT];
  const price = Number(entry?.usdPrice ?? entry?.price ?? 0);
  if (!price || !Number.isFinite(price)) throw new Error('Invalid price returned from Jupiter');
  priceCache = { price, fetchedAt: now };
  return price;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
