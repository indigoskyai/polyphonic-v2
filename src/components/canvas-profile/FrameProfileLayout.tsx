/**
 * FrameProfileLayout — GitHub-style sidebar + gallery rendering of a public profile.
 * Default presentation of /@handle. The Canvas mode is opt-in via ?view=canvas.
 *
 * All items are sourced from useProfileCanvasStore (same source of truth as canvas).
 * Profile chrome (avatar, bio, stats) comes from profiles_public.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProfileItem, ProfilePublic } from '@/stores/profileCanvasStore';
import ArtifactCardTile from './items/ArtifactCardTile';
import ArtifactRenderer from '@/components/canvas/ArtifactRenderer';
import RichBody from '@/components/rich/RichBody';
import { supabase } from '@/integrations/supabase/client';
import type { Artifact } from '@/stores/artifactStore';
import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

interface Props {
  profile: ProfilePublic;
  items: ProfileItem[];
  isOwner: boolean;
  handle: string;
}

type FilterKind = 'all' | 'artifact' | 'upload' | 'note';

function publicUrl(path: string): string {
  const { data } = (supabase as any).storage.from('profile-uploads').getPublicUrl(path);
  return data?.publicUrl || '';
}

function ItemLightbox({ item, onClose }: { item: ProfileItem; onClose: () => void }) {
  const [artifact, setArtifact] = useState<Artifact | null>(
    (item.payload as any)?.snapshot || null,
  );
  const artifactId = (item.payload as any)?.artifact_id;
  useEffect(() => {
    if (artifact || !artifactId) return;
    let cancelled = false;
    (supabase as any).from('artifacts').select('*').eq('id', artifactId).maybeSingle()
      .then(({ data }: { data: Artifact | null }) => { if (!cancelled && data) setArtifact(data); });
    return () => { cancelled = true; };
  }, [artifactId, artifact]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="frame-lightbox-backdrop" onClick={onClose}>
      <div className="frame-lightbox" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="frame-lightbox-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
        <div className="frame-lightbox-body">
          {item.item_type === 'artifact' && artifact && (
            <ArtifactRenderer artifact={artifact} />
          )}
          {item.item_type === 'artifact' && !artifact && (
            <div className="frame-tile-preview-empty"><span className="mono-label">loading…</span></div>
          )}
          {item.item_type === 'upload' && (item.payload as any)?.mime?.startsWith('image/') && (
            <img
              src={publicUrl((item.payload as any).storage_path)}
              alt={(item.payload as any).original_name || ''}
              className="frame-lightbox-image"
            />
          )}
          {item.item_type === 'upload' && !(item.payload as any)?.mime?.startsWith('image/') && (
            <div className="frame-lightbox-file">
              <a
                href={publicUrl((item.payload as any).storage_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="frame-lightbox-file-link"
              >
                Open {(item.payload as any).original_name || 'file'} <ExternalLink size={12} />
              </a>
            </div>
          )}
          {item.item_type === 'note' && (
            <div className="frame-lightbox-note">
              <RichBody source={(item.payload as any)?.markdown || ''} />
            </div>
          )}
        </div>
        {item.caption && <div className="frame-lightbox-caption">{item.caption}</div>}
      </div>
    </div>
  );
}

export default function FrameProfileLayout({ profile, items, isOwner, handle }: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKind>('all');
  const [selected, setSelected] = useState<ProfileItem | null>(null);

  const counts = useMemo(() => {
    const c: Record<FilterKind, number> = { all: items.length, artifact: 0, upload: 0, note: 0 };
    for (const it of items) c[it.item_type] += 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.item_type === filter);
  }, [items, filter]);

  const sortedVisible = useMemo(
    () => [...visible].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [visible],
  );

  const initial = (profile.display_name || handle).slice(0, 2).toUpperCase();

  return (
    <div className="frame-root">
      <main className="frame-main">
        {/* SIDEBAR */}
        <aside className="frame-sidebar">
          <div
            className="frame-avatar"
            style={{
              background: `linear-gradient(135deg, ${profile.accent_color}33, ${profile.accent_color}11)`,
              borderColor: 'var(--border-strong)',
            }}
          >
            <span className="frame-avatar-initial">{initial}</span>
          </div>

          <div className="frame-names">
            <h1 className="frame-name">{profile.display_name || handle}</h1>
            <div className="frame-handle">@{handle}</div>
          </div>

          {profile.bio_short && <p className="frame-bio">{profile.bio_short}</p>}

          {isOwner && (
            <div className="frame-actions">
              <button
                type="button"
                className="frame-btn frame-btn-secondary"
                onClick={() => navigate(`/@${handle}/edit`)}
              >
                edit canvas
              </button>
              <button
                type="button"
                className="frame-btn frame-btn-secondary"
                onClick={() => navigate('/settings/public-profile')}
              >
                settings
              </button>
            </div>
          )}

          <div className="frame-stats" aria-label="Profile stats">
            <div className="frame-stat">
              <div className="frame-stat-value">{counts.all}</div>
              <div className="frame-stat-label">items</div>
            </div>
            <div className="frame-stat">
              <div className="frame-stat-value">{counts.artifact}</div>
              <div className="frame-stat-label">artifacts</div>
            </div>
          </div>

          {profile.bio_long && (
            <div className="frame-about">
              <div className="frame-section-label">about</div>
              <RichBody source={profile.bio_long} />
            </div>
          )}
        </aside>

        {/* GALLERY */}
        <section className="frame-gallery">
          <header className="frame-gallery-header">
            <div className="frame-tabs" role="tablist">
              {(['all', 'artifact', 'upload', 'note'] as FilterKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={filter === k}
                  className={`frame-tab${filter === k ? ' is-active' : ''}`}
                  onClick={() => setFilter(k)}
                >
                  {k === 'all' ? 'all' : k + 's'}
                  <span className="frame-tab-count">{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="frame-view-switch">
              <button
                type="button"
                className="frame-view-btn is-active"
                aria-pressed="true"
                title="Frame view"
              >
                frame
              </button>
              <button
                type="button"
                className="frame-view-btn"
                onClick={() => navigate(`/@${handle}?view=canvas`)}
                title="Canvas view"
              >
                canvas
              </button>
            </div>
          </header>

          {sortedVisible.length === 0 ? (
            <div className="frame-empty">
              <div className="frame-empty-glyph">┌ ┘</div>
              <div className="frame-empty-title">
                {isOwner ? 'Your profile is empty.' : 'Nothing here yet.'}
              </div>
              {isOwner && (
                <button
                  type="button"
                  className="frame-btn frame-btn-primary"
                  onClick={() => navigate(`/@${handle}/edit`)}
                >
                  open canvas editor
                </button>
              )}
            </div>
          ) : (
            <div className="frame-grid">
              {sortedVisible.map((item) => (
                <ArtifactCardTile key={item.id} item={item} onOpen={setSelected} />
              ))}
            </div>
          )}
        </section>
      </main>

      {selected && <ItemLightbox item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
