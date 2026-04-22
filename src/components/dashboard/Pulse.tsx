import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

interface PulseData {
  paragraph: string;
  action: string;
  generated_at?: string;
  cached?: boolean;
}

export default function Pulse() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (!user) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'pulse', refresh }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setData(j);
    } catch (e: any) {
      setError(e.message || 'Failed to load pulse');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [user?.id]);

  return (
    <div
      className="relative"
      style={{
        padding: '20px 28px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'linear-gradient(180deg, rgba(201, 168, 124, 0.025) 0%, transparent 100%)',
      }}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--luca)',
                animation: 'breathe-dot 3s ease-in-out infinite',
                opacity: 0.7,
              }}
            />
            <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
              Today's Pulse
            </span>
            {data?.cached && (
              <span style={{ fontSize: 9, color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>· cached</span>
            )}
          </div>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-ghost)', fontStyle: 'italic' }}>Reading the room…</div>
          ) : error ? (
            <div style={{ fontSize: 12, color: '#e88' }}>{error}</div>
          ) : data ? (
            <>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-body)', maxWidth: 820 }}>
                {data.paragraph}
              </p>
              {data.action && (
                <div className="flex items-center gap-2 mt-3">
                  <div style={{ width: 16, height: 1, background: 'var(--luca)', opacity: 0.4 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-soft)', fontStyle: 'italic' }}>{data.action}</span>
                </div>
              )}
            </>
          ) : null}
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="text-[10px] px-2.5 py-1 rounded shrink-0"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-ghost)',
            cursor: refreshing ? 'wait' : 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
          title="Regenerate today's pulse"
        >
          {refreshing ? '…' : 'refresh'}
        </button>
      </div>
    </div>
  );
}
