import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else navigate('/chat');
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!email) { setError('Enter your email above first.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // Avoid email-enumeration: never reveal whether the address is registered.
    if (error) console.warn('[reset]', error.message);
    setInfo('If that email exists, a reset link is on its way.');
  };

  const handleGoogle = async () => {
    setError(''); setInfo('');
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: `${window.location.origin}/chat`,
    });
    if (result.error) {
      setError(result.error.message ?? 'Google sign-in failed');
      setLoading(false);
      return;
    }
    if (!result.redirected) {
      navigate('/chat');
    }
  };

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-deep)' }}>
      <div className="w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            L
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Luca</span>
        </div>

        <form onSubmit={forgotMode ? handleForgot : handleLogin} className="flex flex-col gap-4">
          <input
            aria-label="Email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none transition-all"
            autoComplete="email"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
            required
          />
          {!forgotMode && (
            <input
              aria-label="Password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none transition-all"
              autoComplete="current-password"
              style={{
                background: 'var(--bg-void)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
              required
            />
          )}
          {error && <p className="text-xs" style={{ color: '#c97c7c' }}>{error}</p>}
          {info && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-10 text-sm font-medium rounded-[var(--radius-md)] transition-all cursor-pointer"
            style={{
              background: 'var(--bg-surface-hover)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {loading
              ? (forgotMode ? 'Sending…' : 'Signing in...')
              : (forgotMode ? 'Send reset link' : 'Sign in')}
          </button>
          <button
            type="button"
            onClick={() => { setForgotMode((v) => !v); setError(''); setInfo(''); }}
            className="text-xs underline self-center cursor-pointer"
            style={{ color: 'var(--text-ghost)', background: 'transparent', border: 'none' }}
          >
            {forgotMode ? 'Back to sign in' : 'Forgot password?'}
          </button>
        </form>

        {!forgotMode && (
          <>
            <div className="my-4 text-[10px] text-center" style={{ color: 'var(--text-ghost)', letterSpacing: '0.08em' }}>OR</div>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full h-10 text-sm font-medium rounded-[var(--radius-md)] cursor-pointer"
              style={{ background: 'var(--bg-void)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
            >
              Continue with Google
            </button>
          </>
        )}

        <p className="mt-6 text-xs text-center" style={{ color: 'var(--text-ghost)' }}>
          No account?{' '}
          <Link to="/auth/signup" className="underline" style={{ color: 'var(--text-tertiary)' }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
