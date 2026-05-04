import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useProfileCanvasStore } from '@/stores/profileCanvasStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import InfiniteCanvas from '@/components/canvas-profile/InfiniteCanvas';
import EditToolbar from '@/components/canvas-profile/EditToolbar';
import StarterLayoutPicker from '@/components/canvas-profile/StarterLayoutPicker';
import FrameProfileLayout from '@/components/canvas-profile/FrameProfileLayout';
import { Pencil, Eye, ArrowLeft } from 'lucide-react';

interface Props { mode: 'view' | 'edit' }

export default function PublicProfileView({ mode }: Props) {
  const params = useParams();
  // Route is /@:handle so params.handle has no leading @
  const handle = (params.handle || '').toLowerCase();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const profile = useProfileCanvasStore((s) => s.profile);
  const items = useProfileCanvasStore((s) => s.items);
  const loading = useProfileCanvasStore((s) => s.loading);
  const loadByHandle = useProfileCanvasStore((s) => s.loadByHandle);

  const [isOwner, setIsOwner] = useState(false);
  const [showStarter, setShowStarter] = useState(false);
  const [vp, setVp] = useState<{ x: number; y: number; zoom: number } | undefined>(undefined);

  // Default presentation = Frame (sidebar+gallery). Canvas = ?view=canvas.
  const view: 'frame' | 'canvas' = (search.get('view') === 'canvas' || mode === 'edit') ? 'canvas' : 'frame';

  useEffect(() => {
    if (!handle) return;
    loadByHandle(handle);
  }, [handle, loadByHandle]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !handle) { setIsOwner(false); return; }
    (supabase as any).from('handles').select('owner_user_id').eq('handle', handle).maybeSingle()
      .then(({ data }: { data: { owner_user_id: string } | null }) => {
        if (!cancelled) setIsOwner(!!data && data.owner_user_id === user.id);
      });
    return () => { cancelled = true; };
  }, [user, handle]);

  // viewport from URL (canvas only)
  const initialVp = useMemo(() => {
    const x = Number(search.get('x'));
    const y = Number(search.get('y'));
    const z = Number(search.get('z'));
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && z > 0) return { x, y, zoom: z };
    return profile?.home_viewport || undefined;
  }, [search, profile?.home_viewport]);

  // when owner enters edit mode and has zero items, show starter picker
  useEffect(() => {
    if (mode === 'edit' && isOwner && !loading && items.length === 0) setShowStarter(true);
  }, [mode, isOwner, loading, items.length]);

  // gate: edit mode requires owner
  useEffect(() => {
    if (mode === 'edit' && user && profile && !isOwner) navigate(`/u/${handle}`, { replace: true });
  }, [mode, user, profile, isOwner, handle, navigate]);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--canvas)', color: 'var(--text-soft)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase' }}>
        loading…
      </div>
    );
  }

  // 404 for visitor: profile missing or unpublished and viewer is not owner
  if (!profile || (!profile.published && !isOwner)) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--canvas)', color: 'var(--text-soft)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--track-mono)', color: 'var(--text-ghost)', textTransform: 'uppercase' }}>
            § 404
          </div>
          <div style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontSize: 32, color: 'var(--text-primary)', marginTop: 6 }}>
            @{handle} hasn't been claimed.
          </div>
          {user && (
            <button
              type="button"
              onClick={() => navigate('/settings/public-profile')}
              style={{
                marginTop: 18, padding: '10px 16px', borderRadius: 999,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text-body)', cursor: 'pointer', fontSize: 12,
                fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
              }}
            >
              claim a handle →
            </button>
          )}
        </div>
      </div>
    );
  }

  // Top bar shared across both views
  const TopBar = (
    <div
      style={{
        position: 'fixed', top: 18, right: 22,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        zIndex: 60,
      }}
    >
      {user && (
        <button
          type="button"
          onClick={() => navigate('/chat')}
          title="Back to app"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 999,
            background: 'var(--surface-3)', border: '1px solid var(--border)',
            color: 'var(--text-body)', cursor: 'pointer', fontSize: 11,
            fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
          }}
        >
          <ArrowLeft size={12} /> app
        </button>
      )}
      {isOwner && mode === 'view' && (
        <button
          type="button"
          onClick={() => navigate(`/u/${handle}/edit`)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 999,
            background: 'var(--ink)', border: '1px solid var(--ink)',
            color: 'var(--floor)', cursor: 'pointer', fontSize: 11,
            fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <Pencil size={12} /> edit
        </button>
      )}
      {isOwner && mode === 'edit' && (
        <button
          type="button"
          onClick={() => navigate(`/u/${handle}`)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 999,
            background: 'var(--surface-3)', border: '1px solid var(--border)',
            color: 'var(--text-body)', cursor: 'pointer', fontSize: 11,
            fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
          }}
        >
          <Eye size={12} /> preview
        </button>
      )}
    </div>
  );

  // FRAME view (default for view-mode)
  if (view === 'frame' && mode === 'view') {
    return (
      <>
        <FrameProfileLayout profile={profile} items={items} isOwner={isOwner} handle={handle} />
        {TopBar}
        {isOwner && !profile.published && (
          <div className="frame-unpublished-banner" style={{
            position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
            color: 'var(--text-body)', padding: '8px 14px', borderRadius: 999,
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
            zIndex: 50,
          }}>
            unpublished — only you can see this
          </div>
        )}
      </>
    );
  }

  // CANVAS view (always for edit mode; opt-in via ?view=canvas in view mode)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)' }}>
      <InfiniteCanvas
        mode={mode}
        initialViewport={initialVp}
        onViewportChange={(v) => {
          setVp(v);
          const next = new URLSearchParams(search);
          next.set('x', String(Math.round(v.x)));
          next.set('y', String(Math.round(v.y)));
          next.set('z', v.zoom.toFixed(3));
          // preserve view=canvas if present
          setSearch(next, { replace: true });
        }}
      />

      {/* Floating header (canvas only) */}
      <div
        style={{
          position: 'absolute', top: 18, left: 22,
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '10px 14px',
          boxShadow: '0 12px 36px -16px rgba(0,0,0,0.55)',
          maxWidth: 'min(420px, 60vw)', zIndex: 50,
        }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: profile.accent_color, opacity: 0.9, flexShrink: 0,
            boxShadow: `0 0 20px -4px ${profile.accent_color}`,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 'var(--track-mono)', color: 'var(--text-soft)', textTransform: 'uppercase' }}>
            @{handle}
          </div>
          <div style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.1, marginTop: 2 }}>
            {profile.display_name}
          </div>
          {profile.bio_short && (
            <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.bio_short}
            </div>
          )}
        </div>
      </div>

      {/* View switch (canvas mode, not in edit) */}
      {mode === 'view' && (
        <div style={{
          position: 'absolute', top: 70, left: 22, zIndex: 50,
          display: 'inline-flex', background: 'var(--surface-3)',
          border: '1px solid var(--border)', borderRadius: 999, padding: 3,
        }}>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(search);
              next.delete('view'); next.delete('x'); next.delete('y'); next.delete('z');
              setSearch(next, { replace: true });
            }}
            style={{
              background: 'transparent', border: 'none', padding: '5px 12px', borderRadius: 999,
              cursor: 'pointer', color: 'var(--text-soft)',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
            }}
          >
            frame
          </button>
          <button
            type="button"
            style={{
              background: 'var(--surface-4)', border: 'none', padding: '5px 12px', borderRadius: 999,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
              cursor: 'default',
            }}
          >
            canvas
          </button>
        </div>
      )}

      {TopBar}

      {mode === 'edit' && isOwner && (
        <EditToolbar onExit={() => navigate(`/u/${handle}`)} viewport={vp || profile.home_viewport} />
      )}

      {showStarter && <StarterLayoutPicker onClose={() => setShowStarter(false)} />}

      {/* Unpublished warning (owner only) */}
      {isOwner && !profile.published && (
        <div
          style={{
            position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
            color: 'var(--text-body)', padding: '8px 14px', borderRadius: 999,
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
            zIndex: 50,
          }}
        >
          unpublished — only you can see this
        </div>
      )}
    </div>
  );
}
