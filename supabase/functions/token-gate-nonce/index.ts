import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ error: 'Invalid session' }, 401);
    }
    const userId = userData.user.id;

    // Generate random nonce (32 bytes hex)
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const issued = new Date().toISOString();
    const message = `Verify $MNEMOS holding for Polyphonic\n\nNonce: ${nonce}\nIssued: ${issued}`;

    // Cleanup old nonces for this user + insert new
    await supabase.from('token_gate_nonces').delete().eq('user_id', userId);
    const { error: insErr } = await supabase
      .from('token_gate_nonces')
      .insert({ nonce, user_id: userId, message });
    if (insErr) {
      return json({ error: `Failed to issue nonce: ${insErr.message}` }, 500);
    }

    return json({ nonce, message });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
