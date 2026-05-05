import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
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
            required />
          <input aria-label="Password" type="password" placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none"
            style={{ background: 'var(--bg-void)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
            minLength={6} required />
          {error && <p className="text-xs" style={{ color: '#c97c7c' }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="h-10 text-sm font-medium rounded-[var(--radius-md)] cursor-pointer"
            style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-xs text-center" style={{ color: 'var(--text-ghost)' }}>
          Already have an account?{' '}
          <Link to="/auth/login" className="underline" style={{ color: 'var(--text-tertiary)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
