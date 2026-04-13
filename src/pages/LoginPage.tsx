import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else navigate('/chat');
    setLoading(false);
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

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none transition-all"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none transition-all"
            style={{
              background: 'var(--bg-void)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
            required
          />
          {error && <p className="text-xs" style={{ color: '#c97c7c' }}>{error}</p>}
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

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
