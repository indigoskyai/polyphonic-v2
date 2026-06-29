import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Grid3X3, LayoutTemplate, RefreshCw } from 'lucide-react';
import FrameProfileLayout from '@/components/canvas-profile/FrameProfileLayout';
import InfiniteCanvas from '@/components/canvas-profile/InfiniteCanvas';
import EditToolbar from '@/components/canvas-profile/EditToolbar';
import StarterLayoutPicker from '@/components/canvas-profile/StarterLayoutPicker';
import { useAuthStore } from '@/stores/authStore';
import { useProfileCanvasStore } from '@/stores/profileCanvasStore';
import { supabase } from '@/integrations/supabase/client';

interface Props { mode: 'view' | 'edit' }

type CanvasViewport = { x: number; y: number; zoom: number };

function normalizeRouteHandle(raw: string | undefined): string {
  return (raw || '').replace(/^@/, '').trim().toLowerCase();
}

function coerceViewport(value: unknown): CanvasViewport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const record = value as Record<string, unknown>;
  const x = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : 0;
  const y = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : 0;
  const zoom = typeof record.zoom === 'number' && Number.isFinite(record.zoom) ? record.zoom : 1;
  return { x, y, zoom };
}

export default function PublicProfileView({ mode }: Props) {
  const { handle: rawHandle } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useProfileCanvasStore((s) => s.profile);
  const items = useProfileCanvasStore((s) => s.items);
  const loading = useProfileCanvasStore((s) => s.loading);
  const loadByHandle = useProfileCanvasStore((s) => s.loadByHandle);
  const handle = normalizeRouteHandle(rawHandle);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 });
  const [starterOpen, setStarterOpen] = useState(false);

  const canvasView = mode === 'edit' || searchParams.get('view') === 'canvas';

  useEffect(() => {
    if (!handle) return;
    void loadByHandle(handle, { includeUnpublished: mode === 'edit' });
  }, [handle, loadByHandle, mode]);

  useEffect(() => {
    if (!handle || !user) {
      setIsOwner(false);
      return;
    }
    let cancelled = false;
    setOwnerLoading(true);
    (supabase as any)
      .from('handles')
      .select('owner_user_id')
      .eq('handle', handle)
      .maybeSingle()
      .then(({ data }: { data: { owner_user_id: string | null } | null }) => {
        if (!cancelled) setIsOwner(data?.owner_user_id === user.id);
      })
      .finally(() => {
        if (!cancelled) setOwnerLoading(false);
      });
    return () => { cancelled = true; };
  }, [handle, user]);

  useEffect(() => {
    if (!profile) return;
    setViewport(coerceViewport(profile.home_viewport));
    document.title = `${profile.display_name || `@${handle}`} · Polyphonic`;
  }, [profile, handle]);

  useEffect(() => {
    setStarterOpen(mode === 'edit' && !loading && items.length === 0);
  }, [items.length, loading, mode]);

  const homeViewport = useMemo(
    () => coerceViewport(profile?.home_viewport),
    [profile?.home_viewport],
  );

  if (!handle) {
    return <ProfileUnavailable title="No handle supplied" body="This profile URL is missing a public handle." />;
  }

  if (loading || (mode === 'edit' && ownerLoading)) {
    return <ProfileLoading handle={handle} />;
  }

  if (!profile) {
    return (
      <ProfileUnavailable
        title="Profile not available"
        body={`@${handle} is either unpublished or has not been claimed yet.`}
      />
    );
  }

  if (mode === 'edit' && !isOwner) {
    return (
      <ProfileUnavailable
        title="Owner access required"
        body={`You need to be signed in as @${handle}'s owner to edit this profile.`}
      />
    );
  }

  if (canvasView) {
    return (
      <div className="frame-canvas-shell">
        <div className="frame-canvas-topbar">
          <button type="button" className="frame-canvas-chip" onClick={() => navigate(`/u/${handle}`)}>
            <ArrowLeft size={13} />
            frame
          </button>
          <div className="frame-canvas-title">
            <span>@{handle}</span>
            <span>{mode === 'edit' ? 'canvas editor' : 'public canvas'}</span>
          </div>
          {mode !== 'edit' && isOwner ? (
            <button type="button" className="frame-canvas-chip" onClick={() => navigate(`/u/${handle}/edit`)}>
              <LayoutTemplate size={13} />
              edit
            </button>
          ) : (
            <button type="button" className="frame-canvas-chip" onClick={() => void loadByHandle(handle, { includeUnpublished: mode === 'edit' })}>
              <RefreshCw size={13} />
              sync
            </button>
          )}
        </div>
        <InfiniteCanvas
          key={`${handle}-${mode}`}
          mode={mode}
          initialViewport={homeViewport}
          onViewportChange={mode === 'edit' ? setViewport : undefined}
        />
        {mode === 'edit' && <EditToolbar onExit={() => navigate(`/u/${handle}`)} viewport={viewport} />}
        {mode === 'edit' && starterOpen && <StarterLayoutPicker onClose={() => setStarterOpen(false)} />}
      </div>
    );
  }

  return (
    <FrameProfileLayout
      profile={profile}
      items={items}
      isOwner={isOwner}
      handle={handle}
    />
  );
}

function ProfileLoading({ handle }: { handle: string }) {
  return (
    <div className="frame-system-shell">
      <div className="frame-system-card" role="status" aria-label="Loading public profile">
        <div className="frame-system-mark">P</div>
        <div>
          <div className="frame-system-kicker">polyphonic profile</div>
          <h1>Opening @{handle}</h1>
          <p>Gathering public artifacts, research notes, and project frames.</p>
        </div>
      </div>
    </div>
  );
}

function ProfileUnavailable({ title, body }: { title: string; body: string }) {
  return (
    <div className="frame-system-shell">
      <div className="frame-system-card">
        <div className="frame-system-mark">
          <Grid3X3 size={18} />
        </div>
        <div>
          <div className="frame-system-kicker">polyphonic profile</div>
          <h1>{title}</h1>
          <p>{body}</p>
          <a className="frame-system-link" href="/">Return to Polyphonic</a>
        </div>
      </div>
    </div>
  );
}
