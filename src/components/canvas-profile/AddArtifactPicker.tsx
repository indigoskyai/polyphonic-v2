import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import type { Artifact } from '@/stores/artifactStore';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onPick: (artifactId: string) => void;
}

export default function AddArtifactPicker({ onClose, onPick }: Props) {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (supabase as any).from('artifacts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60)
      .then(({ data }: { data: Artifact[] | null }) => { setItems(data || []); setLoading(false); });
  }, [user]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'grid', placeItems: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 92vw)', maxHeight: '80vh', overflow: 'auto',
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 22,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--track-mono)', color: 'var(--text-soft)', textTransform: 'uppercase' }}>
            choose an artifact
          </div>
          <button type="button" onClick={onClose} className="code-icon-btn"><X size={12} /></button>
        </div>
        {loading && <div style={{ color: 'var(--text-ghost)' }}>Loading…</div>}
        {!loading && items.length === 0 && (
          <div style={{ color: 'var(--text-ghost)', fontSize: 13 }}>
            You haven't created any artifacts yet. Make something with Luca first.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPick(a.id)}
              style={{
                textAlign: 'left', background: 'var(--surface-1)', border: '1px solid var(--border-faint)',
                borderRadius: 10, padding: 12, cursor: 'pointer', color: 'var(--text-body)',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-mono)' }}>
                {a.kind}{a.version > 1 ? ` · v${a.version}` : ''}
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-primary)' }}>{a.title || 'Untitled'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
