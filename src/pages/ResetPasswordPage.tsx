import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import LandingParticleField, {
  type LandingFieldHandle,
} from '@/components/LandingParticleField';

/**
 * Public route. Supabase recovery links land here with a `type=recovery`
 * fragment; the auth client picks up the session automatically. We then
 * collect a new password and call updateUser.
 *
 * Visually aligned with the rest of the auth flow — same glass-tray
 * card, same POLYPHONIC header, same field/button styling, same
 * particle field flowing around the card. A user arriving from a
 * reset email lands in the same visual world they left.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const fieldRef = useRef<LandingFieldHandle>(null);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(true);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    fieldRef.current?.ripple();
    setInfo('Password updated. Redirecting…');
    setTimeout(() => navigate('/chat', { replace: true }), 800);
  };

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: 'var(--floor)' }}
    >
      <LandingParticleField ref={fieldRef} state="auth" />

      {/* Top-left chrome wordmark — matches the rest of the auth flow */}
      <header
        className="absolute top-0 left-0 right-0 px-6 md:px-10 py-5"
        style={{ zIndex: 3 }}
      >
        <a
          href="/"
          aria-label="Polyphonic"
          style={{
            display: 'inline-block',
            padding: '4px 0',
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
            fontSize: 12,
            fontWeight: 200,
            letterSpacing: '0.22em',
            color: 'var(--text-body)',
            textDecoration: 'none',
            transition: 'color 220ms cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              'var(--text-body)';
          }}
        >
          POLYPHONIC
        </a>
      </header>

      <main
        className="relative h-full w-full flex items-center justify-center px-6"
        style={{ zIndex: 1 }}
      >
        <div className="relative w-full" style={{ maxWidth: 420 }}>
          <Card>
            {!ready ? (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'var(--text-tertiary)',
                  margin: 0,
                }}
              >
                Verifying recovery link…
              </p>
            ) : !hasSession ? (
              <>
                <CardEyebrow>Recovery link</CardEyebrow>
                <CardTitle>This link is no longer valid.</CardTitle>
                <CardSubtitle>
                  It may have expired or already been used. Request a new one
                  from the sign-in page.
                </CardSubtitle>
                <div style={{ marginTop: 24 }}>
                  <a
                    href="/auth/login"
                    style={primaryButtonStyle}
                    onMouseEnter={(e) =>
                      Object.assign(
                        (e.currentTarget as HTMLAnchorElement).style,
                        primaryButtonHover,
                      )
                    }
                    onMouseLeave={(e) =>
                      Object.assign(
                        (e.currentTarget as HTMLAnchorElement).style,
                        primaryButtonStyle,
                      )
                    }
                  >
                    Back to sign in
                  </a>
                </div>
              </>
            ) : (
              <>
                <CardEyebrow>Almost there</CardEyebrow>
                <CardTitle>Set a new password.</CardTitle>
                <CardSubtitle>
                  One quick step to keep your account secure.
                </CardSubtitle>
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-3"
                  style={{ marginTop: 22 }}
                >
                  <FieldInput
                    aria-label="New password"
                    type="password"
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                    autoFocus
                  />
                  <FieldInput
                    aria-label="Confirm new password"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                  {error && (
                    <p
                      role="alert"
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: '#c97c7c',
                        margin: 0,
                      }}
                    >
                      {error}
                    </p>
                  )}
                  {info && (
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: 'var(--text-tertiary)',
                        margin: 0,
                      }}
                    >
                      {info}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      ...primaryButtonStyle,
                      opacity: loading ? 0.55 : 1,
                      cursor: loading ? 'default' : 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (loading) return;
                      Object.assign(
                        (e.currentTarget as HTMLButtonElement).style,
                        primaryButtonHover,
                      );
                    }}
                    onMouseLeave={(e) =>
                      Object.assign(
                        (e.currentTarget as HTMLButtonElement).style,
                        { ...primaryButtonStyle, opacity: loading ? 0.55 : 1 },
                      )
                    }
                  >
                    {loading ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              </>
            )}
          </Card>
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
          <a href="/privacy" style={{ color: 'inherit' }}>
            Privacy
          </a>
          <span aria-hidden="true">·</span>
          <a href="/terms" style={{ color: 'inherit' }}>
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}

/* ───── Card layout (matches AuthShell from LandingPage) ───── */

function Card({ children }: { children: React.ReactNode }) {
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
            POLYPHONIC
          </span>
        </div>
        <div style={{ padding: '26px 32px 0' }}>{children}</div>
      </div>
    </div>
  );
}

function CardEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 'var(--track-meta)',
        textTransform: 'uppercase',
        color: 'var(--text-whisper)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </h1>
  );
}

function CardSubtitle({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </p>
  );
}

/* ───── Inputs + button (mirror LandingPage's primitives) ───── */

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props;
  return (
    <input
      {...rest}
      style={{
        width: '100%',
        height: 44,
        padding: '0 15px',
        background: 'rgba(10, 10, 13, 0.55)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: 10,
        outline: 'none',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: 'var(--track-body)',
        color: 'var(--text-primary)',
        transition:
          'border-color 220ms cubic-bezier(0.22,1,0.36,1), background 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms cubic-bezier(0.22,1,0.36,1)',
        ...style,
      }}
      onFocus={(e) => {
        const el = e.currentTarget as HTMLInputElement;
        el.style.borderColor = 'rgba(201, 168, 124, 0.32)';
        el.style.background = 'rgba(20, 20, 24, 0.7)';
        el.style.boxShadow =
          '0 0 0 3px rgba(201, 168, 124, 0.06), inset 0 1px 0 rgba(255,255,255,0.025)';
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        const el = e.currentTarget as HTMLInputElement;
        el.style.borderColor = 'rgba(255, 255, 255, 0.07)';
        el.style.background = 'rgba(10, 10, 13, 0.55)';
        el.style.boxShadow = 'none';
        rest.onBlur?.(e);
      }}
    />
  );
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 44,
  background: 'linear-gradient(180deg, #f4f3f0 0%, #e8e6e1 100%)',
  border: '1px solid rgba(255, 255, 255, 0.5)',
  borderRadius: 10,
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '-0.005em',
  color: '#1a1a1f',
  textDecoration: 'none',
  cursor: 'pointer',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 0 rgba(0,0,0,0.4), 0 8px 20px -8px rgba(0,0,0,0.6)',
  transition:
    'transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms cubic-bezier(0.22,1,0.36,1), background 220ms cubic-bezier(0.22,1,0.36,1)',
};

const primaryButtonHover: React.CSSProperties = {
  transform: 'translateY(-0.5px)',
  background: 'linear-gradient(180deg, #faf9f6 0%, #f0eee9 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 0 rgba(0,0,0,0.4), 0 12px 28px -10px rgba(0,0,0,0.65)',
};
