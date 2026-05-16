import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useTokenGateStore } from '@/stores/tokenGateStore';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { session, loading } = useAuthStore();
  const { status, hydrate } = useTokenGateStore();
  const location = useLocation();

  useEffect(() => {
    if (session && status === 'unknown') {
      hydrate();
    }
  }, [session, status, hydrate]);

  if (loading) return null;
  if (!session) return <Navigate to="/auth/login" replace state={{ from: location }} />;
  if (status === 'unknown' || status === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-deep)' }}>
        <p className="text-xs" style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
          Verifying access…
        </p>
      </div>
    );
  }
  if (status === 'verified' || status === 'bypass') return <>{children}</>;
  return <Navigate to="/access" replace state={{ from: location }} />;
}
