import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useTokenGateStore } from '@/stores/tokenGateStore';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { session, user, loading } = useAuthStore();
  const { status, hydrate } = useTokenGateStore();
  const location = useLocation();
  const [hasModelKey, setHasModelKey] = useState(false);
  const [keyCheckedFor, setKeyCheckedFor] = useState<string | null>(null);

  useEffect(() => {
    if (session && status === 'unknown') {
      hydrate();
    }
  }, [session, status, hydrate]);

  useEffect(() => {
    if (!user?.id) {
      setHasModelKey(false);
      setKeyCheckedFor(null);
      return;
    }
    let canceled = false;
    setKeyCheckedFor(null);
    supabase
      .from('user_api_keys')
      .select('key_preview')
      .maybeSingle()
      .then(({ data }) => {
        if (canceled) return;
        setHasModelKey(Boolean(data?.key_preview));
        setKeyCheckedFor(user.id);
      })
      .catch(() => {
        if (canceled) return;
        setHasModelKey(false);
        setKeyCheckedFor(user.id);
      });
    return () => { canceled = true; };
  }, [user?.id]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth/login" replace state={{ from: location }} />;
  if (keyCheckedFor !== user?.id || status === 'unknown' || status === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-deep)' }}>
        <p className="text-xs" style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
          Verifying access…
        </p>
      </div>
    );
  }
  if (hasModelKey || status === 'verified' || status === 'bypass') return <>{children}</>;
  return <Navigate to="/access" replace state={{ from: location }} />;
}
