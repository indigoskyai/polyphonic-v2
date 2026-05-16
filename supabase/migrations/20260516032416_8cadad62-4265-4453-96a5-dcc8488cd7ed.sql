
CREATE TABLE public.token_gate_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  usd_value numeric NOT NULL DEFAULT 0,
  price_used numeric NOT NULL DEFAULT 0,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.token_gate_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own verification"
  ON public.token_gate_verifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.token_gate_nonces (
  nonce text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.token_gate_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own nonces"
  ON public.token_gate_nonces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_token_gate_nonces_created ON public.token_gate_nonces(created_at);
