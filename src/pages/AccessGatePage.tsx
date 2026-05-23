import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTokenGateStore } from '@/stores/tokenGateStore';
import LandingParticleField from '@/components/LandingParticleField';
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
  const location = useLocation();
  const { session, signOut } = useAuthStore();
  const { status, hydrate, setResult } = useTokenGateStore();
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeWalletId, setActiveWalletId] = useState<WalletId | null>(null);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<{
    balance: number;
    usdValue: number;
    price: number;
    shortfall: number;
  } | null>(null);
  const cardElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWallets(detectWallets());
    if (session && status === 'unknown') hydrate();
    const handler = () => setWallets(detectWallets());
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [session, status, hydrate]);

  const routeState = (location.state || {}) as { from?: string; reason?: string };
  const returnPath = typeof routeState.from === 'string' ? routeState.from : '/chat';
  const agentLimitFlow = routeState.reason === 'agent_limit';

  useEffect(() => {
    if (status === 'verified' || status === 'bypass') {
      navigate(returnPath, { replace: true });
    }
  }, [status, navigate, returnPath]);

  const supportedFallback = useMemo(
    () =>
      (['phantom', 'solflare', 'backpack', 'glow', 'okx'] as WalletId[])
        .filter((id) => !wallets.find((w) => w.id === id))
        .map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), url: getWalletDownloadUrl(id) })),
    [wallets],
  );

  if (!session) return <Navigate to="/" replace />;

  const verify = async (w: DetectedWallet) => {
    setPhase('signing');
    setActiveWalletId(w.id);
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
    } finally {
      if (phase !== 'verifying') setActiveWalletId(null);
    }
  };

  const isBusy = phase === 'signing' || phase === 'verifying';

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: 'var(--floor)' }}
    >
      <LandingParticleField state="auth" cardRef={cardElRef} />

      {/* Top chrome — POLYPHONIC wordmark + Sign out */}
      <header
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 md:px-10 py-5"
        style={{ zIndex: 3 }}
      >
        <span
          style={{
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
            fontSize: 12,
            fontWeight: 200,
            letterSpacing: '0.22em',
            color: 'var(--text-body)',
          }}
        >
          POLYPHONIC
        </span>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/', { replace: true });
          }}
          className="transition-all"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: 'var(--track-body)',
            color: 'var(--text-body)',
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-body)';
          }}
        >
          Sign out
        </button>
      </header>

      <main
        className="relative h-full w-full flex items-center justify-center px-6"
        style={{ zIndex: 1 }}
      >
        <div ref={cardElRef} className="relative w-full" style={{ maxWidth: 440 }}>
          <AuthShell
            title={agentLimitFlow ? 'Unlock additional agents' : 'Verify $MNEMOS access'}
            subtitle={
              agentLimitFlow
                ? `Every user can create one custom agent. To create more right now, connect a Solana wallet holding at least $${MIN_USD} USD of $MNEMOS and sign a message. Subscriptions are coming soon.`
                : `Connect a Solana wallet holding at least $${MIN_USD} USD of $MNEMOS to unlock temporary advanced entitlements. Re-verified once every 24 hours.`
            }
          >
            {phase === 'denied' && lastResult && (
              <div
                style={{
                  marginBottom: 18,
                  padding: 14,
                  borderRadius: 12,
                  background: 'rgba(10, 10, 13, 0.55)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12.5,
                    color: 'var(--text-primary)',
                    marginBottom: 10,
                  }}
                >
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
                  style={{
                    display: 'block',
                    marginTop: 14,
                    height: 40,
                    lineHeight: '40px',
                    textAlign: 'center',
                    background: 'linear-gradient(180deg, #f4f3f0 0%, #e8e6e1 100%)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    borderRadius: 10,
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: '#1a1a1f',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 0 rgba(0,0,0,0.4), 0 8px 20px -8px rgba(0,0,0,0.6)',
                    textDecoration: 'none',
                  }}
                >
                  Buy $MNEMOS on Jupiter
                </a>
              </div>
            )}

            {error && (
              <p
                role="alert"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: '#c97c7c',
                  marginBottom: 14,
                }}
              >
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              {wallets.length === 0 && (
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-whisper)',
                    marginBottom: 4,
                  }}
                >
                  No Solana wallets detected in this browser.
                </p>
              )}
              {wallets.map((w, i) => {
                const isPrimary = i === 0;
                const isActive = activeWalletId === w.id && isBusy;
                const statusLabel = isActive
                  ? phase === 'signing'
                    ? 'sign in wallet…'
                    : 'verifying…'
                  : 'connect';
                return (
                  <WalletButton
                    key={w.id}
                    label={w.name}
                    statusLabel={statusLabel}
                    primary={isPrimary}
                    disabled={isBusy}
                    onClick={() => verify(w)}
                  />
                );
              })}

              {supportedFallback.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: 'var(--track-meta)',
                      textTransform: 'uppercase',
                      color: 'var(--text-whisper)',
                      marginBottom: 10,
                    }}
                  >
                    Don't have a wallet?
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {supportedFallback.map((w) => (
                      <a
                        key={w.id}
                        href={w.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          color: 'var(--text-tertiary)',
                          textDecoration: 'underline',
                          textDecorationColor: 'rgba(255,255,255,0.15)',
                          textUnderlineOffset: 3,
                        }}
                      >
                        {w.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AuthShell>
        </div>
      </main>

      <footer
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-6"
        style={{ zIndex: 3 }}
      >
        <div
          className="flex items-center gap-3"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 'var(--track-meta)',
            textTransform: 'uppercase',
            color: 'var(--text-whisper)',
          }}
        >
          <Link to="/privacy" className="hover:underline">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms" className="hover:underline">Terms</Link>
        </div>
      </footer>
    </div>
  );
}

/* ─── Card shell — visually identical to LandingPage AuthShell ────── */

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'relative',
        padding: 6,
        borderRadius: 22,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 18%, rgba(255,255,255,0.006) 60%, rgba(255,255,255,0.022) 100%)',
        border: '1px solid rgba(255,255,255,0.045)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.05), 0 28px 72px -16px rgba(0,0,0,0.6), 0 8px 24px -6px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
      }}
    >
      <div
        style={{
          background:
            'linear-gradient(180deg, rgba(22,22,26,0.92) 0%, rgba(18,18,22,0.96) 50%, rgba(16,16,20,0.96) 100%)',
          border: '1px solid rgba(255,255,255,0.055)',
          borderRadius: 17,
          padding: '0 0 30px',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.032), inset 0 -1px 0 rgba(255,255,255,0.012)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 0 17px',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            position: 'relative',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              bottom: -1,
              height: 1,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 25%, rgba(255,255,255,0.07) 75%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />
          <span
            style={{
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
              fontSize: 11.5,
              fontWeight: 200,
              letterSpacing: '0.22em',
              color: 'var(--text-body)',
            }}
          >
            EARLY ACCESS
          </span>
        </div>

        <div style={{ padding: '26px 32px 0' }}>
          <h1
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 24,
              fontWeight: 450,
              letterSpacing: '-0.018em',
              lineHeight: 1.2,
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                lineHeight: 1.55,
                color: 'var(--text-body)',
                marginTop: 9,
                marginBottom: 0,
                maxWidth: 360,
              }}
            >
              {subtitle}
            </p>
          )}
          <div style={{ marginTop: 24 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function WalletButton({
  label,
  statusLabel,
  primary,
  disabled,
  onClick,
}: {
  label: string;
  statusLabel: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          width: '100%',
          height: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          background: 'linear-gradient(180deg, #f4f3f0 0%, #e8e6e1 100%)',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: 10,
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '-0.005em',
          color: '#1a1a1f',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 0 rgba(0,0,0,0.4), 0 8px 20px -8px rgba(0,0,0,0.6)',
          transition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'rgba(26,26,31,0.55)' }}>
          {statusLabel}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 100%)',
        border: '1px solid rgba(255,255,255,0.075)',
        borderRadius: 10,
        fontFamily: 'var(--font-sans)',
        fontSize: 13.5,
        fontWeight: 450,
        color: 'var(--text-body)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.025), 0 1px 0 rgba(0,0,0,0.25)',
        transition: 'border-color 220ms cubic-bezier(0.22,1,0.36,1), color 220ms cubic-bezier(0.22,1,0.36,1)',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.13)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.075)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-body)';
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-whisper)' }}>
        {statusLabel}
      </span>
    </button>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '3px 0' }}>
      <span style={{ fontSize: 11, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
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
