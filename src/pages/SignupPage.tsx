import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authRedirectTo, signInWithGoogle, signInWithApple } from '@/lib/authFlow';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: authRedirectTo('/chat') },
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    const { error, redirected } = await signInWithGoogle();
    if (error) {
      setError(error);
      setLoading(false);
      return;
    }
    if (!redirected) {
      navigate('/chat');
    }
  };

  const handleApple = async () => {
    setError('');
    setLoading(true);
    const { error, redirected } = await signInWithApple();
    if (error) {
      setError(error);
      setLoading(false);
      return;
    }
    if (!redirected) {
      navigate('/chat');
    }
  };

  if (sent) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-deep)' }}>
        <div className="w-full max-w-sm p-8 text-center">
          <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>Check your email</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>We sent a confirmation link to {email}</p>
          <Link to="/auth/login" className="block mt-6 text-xs underline" style={{ color: 'var(--text-ghost)' }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-deep)' }}>
      <div className="w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            L
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Create account</span>
        </div>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <input aria-label="Email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none"
            style={{ background: 'var(--bg-void)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
            autoComplete="email"
            required />
          <input aria-label="Password" type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none"
            style={{ background: 'var(--bg-void)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
            minLength={8}
            autoComplete="new-password"
            required />
          {error && <p className="text-xs" style={{ color: '#c97c7c' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="h-10 text-sm font-medium rounded-[var(--radius-md)] cursor-pointer"
            style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <div
          aria-hidden="true"
          className="my-4 flex items-center gap-3"
          style={{ color: 'var(--text-ghost)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
        >
          <span className="h-px flex-1" style={{ background: 'var(--border-faint)' }} />
          <span>or</span>
          <span className="h-px flex-1" style={{ background: 'var(--border-faint)' }} />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          aria-label="Continue with Google"
          className="h-10 w-full text-sm font-medium rounded-[var(--radius-md)] cursor-pointer flex items-center justify-center gap-2"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            opacity: loading ? 0.55 : 1,
          }}
        >
          <span
            aria-hidden="true"
            className="flex items-center justify-center"
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            G
          </span>
          Continue with Google
        </button>

        <button
          type="button"
          onClick={handleApple}
          disabled={loading}
          aria-label="Continue with Apple"
          className="h-10 w-full mt-3 text-sm font-medium rounded-[var(--radius-md)] cursor-pointer flex items-center justify-center gap-2"
          style={{
            background: 'var(--bg-void)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            opacity: loading ? 0.55 : 1,
          }}
        >
          <span
            aria-hidden="true"
            className="flex items-center justify-center"
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            
          </span>
          Continue with Apple
        </button>

        <p className="mt-6 text-xs text-center" style={{ color: 'var(--text-ghost)' }}>
          Already have an account?{' '}
          <Link to="/auth/login" className="underline" style={{ color: 'var(--text-tertiary)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
