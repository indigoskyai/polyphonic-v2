import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Public route. Supabase recovery links land here with a `type=recovery`
 * fragment; the auth client picks up the session automatically. We then
 * collect a new password and call updateUser.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen first so we capture the PASSWORD_RECOVERY event from the URL hash.
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
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setInfo('Password updated. Redirecting…');
    setTimeout(() => navigate('/chat', { replace: true }), 800);
  };

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-deep)' }}>
      <div className="w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            L
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Reset password</span>
        </div>

        {!ready ? (
          <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>Verifying recovery link…</p>
        ) : !hasSession ? (
          <p className="text-xs" style={{ color: '#c97c7c' }}>
            This recovery link is invalid or expired. Request a new one from the sign-in page.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              aria-label="New password"
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none transition-all"
              style={{ background: 'var(--bg-void)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
            <input
              aria-label="Confirm new password"
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-10 px-3.5 text-sm rounded-[var(--radius-md)] outline-none transition-all"
              style={{ background: 'var(--bg-void)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
              required
              minLength={8}
              autoComplete="new-password"
            />
            {error && <p className="text-xs" style={{ color: '#c97c7c' }}>{error}</p>}
            {info && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{info}</p>}
            <button
              type="submit"
              disabled={loading}
              className="h-10 text-sm font-medium rounded-[var(--radius-md)] transition-all cursor-pointer"
              style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
