import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTokenGateStore } from '@/stores/tokenGateStore';
import {
  connectAndSign,
  detectWallets,
  getWalletDownloadUrl,
  type DetectedWallet,
  type WalletId,
} from '@/lib/solanaWallet';

const MIN_USD = 50;
const MNEMOS_MINT = 'BMcReKHFc5KssDgDisZBq3YmJe5RdjnBUumxpXpRpump';
const JUP_SWAP_URL = `https://jup.ag/swap/USDC-${MNEMOS_MINT}`;

type Phase = 'idle' | 'signing' | 'verifying' | 'denied' | 'error';

export default function AccessGatePage() {
  const navigate = useNavigate();
  const { session, signOut } = useAuthStore();
  const { status, hydrate, setResult, balance, usdValue } = useTokenGateStore();
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<{
    balance: number;
    usdValue: number;
    price: number;
    shortfall: number;
  } | null>(null);

  useEffect(() => {
    setWallets(detectWallets());
    if (session && status === 'unknown') hydrate();
    const handler = () => setWallets(detectWallets());
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [session, status, hydrate]);

  useEffect(() => {
    if (status === 'verified' || status === 'bypass') {
      navigate('/chat', { replace: true });
    }
  }, [status, navigate]);

  const supportedFallback = useMemo(
    () =>
      (['phantom', 'solflare', 'backpack', 'glow', 'okx'] as WalletId[])
        .filter((id) => !wallets.find((w) => w.id === id))
        .map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), url: getWalletDownloadUrl(id) })),
    [wallets],
  );

  if (!session) return <Navigate to="/auth/login" replace />;

  const verify = async (w: DetectedWallet) => {
    setPhase('signing');
    setError('');
    try {
      const { data: nonceData, error: nonceErr } = await supabase.functions.invoke('token-gate-nonce', {
        body: {},
      });
      if (nonceErr) throw nonceErr;
      const { nonce, message } = nonceData as { nonce: string; message: string };

      const { address, signatureBase58 } = await connectAndSign(w.provider, message);

      setPhase('verifying');
      const { data, error: vErr } = await supabase.functions.invoke('verify-token-gate', {
        body: { walletAddress: address, signature: signatureBase58, nonce },
      });
      if (vErr) throw vErr;

      const result = data as {
        allowed: boolean;
        balance: number;
        usdValue: number;
        price: number;
        shortfall: number;
      };
      setLastResult(result);

      if (result.allowed) {
        setResult({
          status: 'verified',
          walletAddress: address,
          balance: result.balance,
          usdValue: result.usdValue,
          priceUsed: result.price,
        });
      } else {
        setPhase('denied');
      }
    } catch (e: any) {
      console.error('[access] verify failed', e);
      setError(e?.message ?? 'Verification failed. Try again.');
      setPhase('error');
    }
  };

  const isBusy = phase === 'signing' || phase === 'verifying';

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-deep)' }}>
      <div className="w-full max-w-md p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              L
            </div>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}
            >
              Early access
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/auth/login', { replace: true });
            }}
            className="text-[11px] underline cursor-pointer"
            style={{ color: 'var(--text-ghost)', background: 'transparent', border: 'none' }}
          >
            Sign out
          </button>
        </div>

        <div className="mb-6">
          <h1
            className="text-base mb-2"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '0.01em' }}
          >
            Verify $MNEMOS holdings
          </h1>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            Polyphonic is in early access for $MNEMOS holders. Connect a Solana wallet that holds at least
            ${MIN_USD} USD of $MNEMOS and sign a message to prove ownership. Re-verified once every 24 hours.
          </p>
        </div>

        {phase === 'denied' && lastResult && (
          <div
            className="mb-6 p-4 rounded-[var(--radius-md)]"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid var(--border)',
            }}
          >
            <p className="text-xs mb-3" style={{ color: 'var(--text-primary)' }}>
              Not enough $MNEMOS in this wallet.
            </p>
            <Row label="Balance" value={`${formatNumber(lastResult.balance)} $MNEMOS`} />
            <Row label="USD value" value={`$${formatUsd(lastResult.usdValue)}`} />
            <Row label="Required" value={`$${MIN_USD.toFixed(2)}`} />
            <Row label="Shortfall" value={`$${formatUsd(lastResult.shortfall)}`} accent />
            <a
              href={JUP_SWAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-4 h-9 text-xs font-medium rounded-full text-center leading-9 cursor-pointer"
              style={{
                background: 'var(--bg-surface-hover)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Buy $MNEMOS on Jupiter
            </a>
          </div>
        )}

        {error && (
          <p className="mb-4 text-xs" style={{ color: '#c97c7c' }}>
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {wallets.length === 0 && (
            <p
              className="text-[11px] mb-2"
              style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}
            >
              No Solana wallets detected in this browser.
            </p>
          )}
          {wallets.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => verify(w)}
              disabled={isBusy}
              className="h-10 px-4 text-sm font-medium rounded-full cursor-pointer flex items-center justify-between transition-all"
              style={{
                background: 'var(--bg-void)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                opacity: isBusy ? 0.55 : 1,
              }}
            >
              <span>{w.name}</span>
              <span
                className="text-[10px]"
                style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}
              >
                {phase === 'signing' ? 'sign…' : phase === 'verifying' ? 'verifying…' : 'connect'}
              </span>
            </button>
          ))}

          {supportedFallback.length > 0 && (
            <div className="mt-4">
              <p
                className="text-[10px] mb-2"
                style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}
              >
                Don't have a wallet?
              </p>
              <div className="flex flex-wrap gap-2">
                {supportedFallback.map((w) => (
                  <a
                    key={w.id}
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] underline"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {w.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-[11px] text-center" style={{ color: 'var(--text-ghost)' }}>
          <Link to="/privacy" className="underline" style={{ color: 'var(--text-ghost)' }}>
            Privacy
          </Link>
          <span aria-hidden="true" className="mx-2">
            /
          </span>
          <Link to="/terms" className="underline" style={{ color: 'var(--text-ghost)' }}>
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px] py-1">
      <span style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      <span
        style={{
          color: accent ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}
function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
