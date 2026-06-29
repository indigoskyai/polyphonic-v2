/**
 * FrameProfileLayout — default public profile surface for /u/:handle.
 * Uses the canvas profile store as the source of truth, then renders a
 * scan-friendly public frame: identity, live artifacts, research traces,
 * project signals, and timeline.
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
import {
  ArrowUpRight,
  Compass,
  ExternalLink,
  FileText,
  FlaskConical,
  LayoutTemplate,
  Link2,
  Network,
  PenLine,
  Radio,
  X,
} from 'lucide-react';

interface Props {
  profile: ProfilePublic;
  items: ProfileItem[];
  isOwner: boolean;
  handle: string;
}

type FilterKind = 'all' | 'artifact' | 'project' | 'research' | 'upload' | 'note';

type ProfileLink = {
  label: string;
  url: string;
};

const FILTERS: Array<{ key: FilterKind; label: string }> = [
  { key: 'all', label: 'work' },
  { key: 'artifact', label: 'artifacts' },
  { key: 'project', label: 'projects' },
  { key: 'research', label: 'research' },
  { key: 'upload', label: 'uploads' },
  { key: 'note', label: 'notes' },
];

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'artifact',
  'because',
  'before',
  'between',
  'build',
  'canvas',
  'from',
  'into',
  'notes',
  'profile',
  'project',
  'research',
  'system',
  'that',
  'their',
  'this',
  'with',
  'work',
  'your',
]);

function normalizeStoragePath(path: string): string {
  return path.replace(/^profile-uploads\//, '');
}

function publicUrl(path: string): string {
  const { data } = (supabase as any).storage.from('profile-uploads').getPublicUrl(normalizeStoragePath(path));
  return data?.publicUrl || '';
}

function safeAccent(value: string | null | undefined): string {
  return /^#[0-9a-f]{3,8}$/i.test(value || '') ? value! : '#c9a87c';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayText(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function artifactKind(item: ProfileItem): string {
  if (item.item_type !== 'artifact') return '';
  return String((item.payload as any)?.snapshot?.kind || (item.payload as any)?.kind || '').toLowerCase();
}

function itemTitle(item: ProfileItem): string {
  if (item.item_type === 'artifact') {
    return (item.payload as any)?.snapshot?.title
      || (item.payload as any)?.title
      || 'Untitled artifact';
  }
  if (item.item_type === 'upload') {
    return (item.payload as any)?.original_name || 'Upload';
  }
  const md: string = (item.payload as any)?.markdown || '';
  const heading = md.match(/^#+\s+(.+)$/m);
  if (heading) return heading[1].trim();
  const first = md.split('\n').find((line) => line.trim().length > 0) || 'Note';
  return first.replace(/[#*_`]/g, '').slice(0, 72).trim() || 'Note';
}

function itemSearchText(item: ProfileItem): string {
  const payload = item.payload as Record<string, unknown>;
  const snapshot = asRecord(payload.snapshot);
  return [
    item.item_type,
    item.caption,
    itemTitle(item),
    payload.kind,
    payload.title,
    payload.original_name,
    payload.markdown,
    snapshot.kind,
    snapshot.title,
    arrayText(payload.tags).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function itemFacet(item: ProfileItem): FilterKind {
  const text = itemSearchText(item);
  if (hasAny(text, ['research', 'paper', 'citation', 'thesis', 'hypothesis', 'study', 'archive', 'reading'])) {
    return 'research';
  }
  if (hasAny(text, ['project', 'prototype', 'app', 'tool', 'dashboard', 'game', 'engine', 'studio', 'interface'])) {
    return 'project';
  }
  return item.item_type;
}

function matchesFilter(item: ProfileItem, filter: FilterKind): boolean {
  if (filter === 'all') return true;
  if (filter === 'artifact' || filter === 'upload' || filter === 'note') return item.item_type === filter;
  return itemFacet(item) === filter;
}

function relativeDate(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'recently';
  const delta = Date.now() - then;
  const days = Math.max(0, Math.floor(delta / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 31) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function extractLinks(theme: Record<string, unknown>): ProfileLink[] {
  const raw = Array.isArray(theme.links) ? theme.links : [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { label: item.replace(/^https?:\/\//, '').replace(/\/$/, ''), url: item };
      }
      const record = asRecord(item);
      const url = typeof record.url === 'string' ? record.url : '';
      if (!url) return null;
      const label = typeof record.label === 'string'
        ? record.label
        : url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return { label, url };
    })
    .filter((item): item is ProfileLink => Boolean(item))
    .slice(0, 5);
}

function extractFocus(profile: ProfilePublic, items: ProfileItem[]): string[] {
  const theme = asRecord(profile.theme);
  const declared = [
    ...arrayText(theme.focus),
    ...arrayText(theme.fields),
    ...arrayText(theme.questions),
    ...arrayText(theme.methods),
  ];
  if (declared.length) return Array.from(new Set(declared)).slice(0, 8);

  const counts = new Map<string, number>();
  for (const item of items) {
    const words = `${itemTitle(item)} ${item.caption || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 8);
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
            <div className="frame-tile-preview-empty"><span className="mono-label">loading...</span></div>
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

  const theme = useMemo(() => asRecord(profile.theme), [profile.theme]);
  const links = useMemo(() => extractLinks(theme), [theme]);
  const focus = useMemo(() => extractFocus(profile, items), [profile, items]);
  const accent = safeAccent(profile.accent_color);
  const avatarUrl = profile.avatar_storage_path ? publicUrl(profile.avatar_storage_path) : '';

  const counts = useMemo(() => {
    const c: Record<FilterKind, number> = { all: items.length, artifact: 0, project: 0, research: 0, upload: 0, note: 0 };
    for (const item of items) {
      c[item.item_type] += 1;
      const facet = itemFacet(item);
      if (facet === 'project' || facet === 'research') c[facet] += 1;
    }
    return c;
  }, [items]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [items],
  );

  const visible = useMemo(
    () => sortedItems.filter((item) => matchesFilter(item, filter)),
    [sortedItems, filter],
  );

  const researchItems = useMemo(
    () => sortedItems.filter((item) => itemFacet(item) === 'research').slice(0, 4),
    [sortedItems],
  );

  const projectItems = useMemo(
    () => sortedItems.filter((item) => itemFacet(item) === 'project').slice(0, 4),
    [sortedItems],
  );

  const liveCount = useMemo(
    () => items.filter((item) => item.item_type === 'artifact' && ['html', 'react', 'svg'].includes(artifactKind(item))).length,
    [items],
  );

  const initial = (profile.display_name || handle).slice(0, 2).toUpperCase();
  const subtitle = profile.bio_short || 'Artifacts, research notes, and project traces made public through Polyphonic.';
  const updated = profile.updated_at ? relativeDate(profile.updated_at) : 'recently';

  return (
    <div className="frame-root" style={{ ['--frame-accent' as string]: accent }}>
      <header className="frame-topbar">
        <a className="frame-brand" href="/">
          <span className="frame-brand-mark">P</span>
          <span>Polyphonic</span>
        </a>
        <nav className="frame-topnav" aria-label="Profile sections">
          <a href="#work">Work</a>
          <a href="#research">Research</a>
          <a href="#network">Network</a>
        </nav>
      </header>

      <main className="frame-main">
        <aside className="frame-sidebar">
          <div
            className="frame-avatar"
            style={{
              background: `linear-gradient(135deg, ${accent}24, rgba(244, 243, 240, 0.03))`,
              borderColor: `${accent}44`,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="frame-avatar-image" />
            ) : (
              <span className="frame-avatar-initial">{initial}</span>
            )}
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
                onClick={() => navigate(`/u/${handle}/edit`)}
              >
                <PenLine size={13} />
                edit
              </button>
              <button
                type="button"
                className="frame-btn frame-btn-secondary"
                onClick={() => navigate('/settings/public-profile')}
              >
                <LayoutTemplate size={13} />
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
              <div className="frame-stat-value">{liveCount}</div>
              <div className="frame-stat-label">live html</div>
            </div>
            <div className="frame-stat">
              <div className="frame-stat-value">{counts.project}</div>
              <div className="frame-stat-label">projects</div>
            </div>
            <div className="frame-stat">
              <div className="frame-stat-value">{counts.research}</div>
              <div className="frame-stat-label">research</div>
            </div>
          </div>

          {links.length > 0 && (
            <div className="frame-links">
              <div className="frame-section-label">elsewhere</div>
              {links.map((link) => (
                <a key={link.url} className="frame-link" href={link.url} target="_blank" rel="noreferrer">
                  <Link2 size={12} />
                  <span>{link.label}</span>
                  <ArrowUpRight size={11} />
                </a>
              ))}
            </div>
          )}

          <div className="frame-focus">
            <div className="frame-section-label">signal vocabulary</div>
            <div className="frame-focus-chips">
              {(focus.length ? focus : ['artifacts', 'projects', 'research']).map((term) => (
                <span key={term} className="frame-focus-chip">{term}</span>
              ))}
            </div>
          </div>

          {profile.bio_long && (
            <div className="frame-about">
              <div className="frame-section-label">about</div>
              <RichBody source={profile.bio_long} />
            </div>
          )}
        </aside>

        <section className="frame-profile-stage">
          <section className="frame-hero" aria-labelledby="frame-profile-title">
            <div className="frame-hero-kicker">
              <Radio size={13} />
              <span>public frame</span>
              <span>updated {updated}</span>
            </div>
            <div className="frame-hero-copy">
              <h2 id="frame-profile-title">{profile.display_name || handle}'s public work</h2>
              <p>{subtitle}</p>
            </div>
            <div className="frame-hero-actions">
              <button type="button" className="frame-btn frame-btn-primary" onClick={() => navigate(`/u/${handle}?view=canvas`)}>
                <Compass size={14} />
                canvas
              </button>
              <a className="frame-btn frame-btn-secondary" href="#work">
                <ArrowUpRight size={13} />
                browse
              </a>
            </div>
          </section>

          <section className="frame-network" id="network" aria-label="Resonance signals">
            <div className="frame-network-head">
              <div>
                <div className="frame-section-label">resonance map</div>
                <h3>Signals for collective intelligence</h3>
              </div>
              <Network size={16} />
            </div>
            <div className="frame-signal-grid">
              <div className="frame-signal">
                <span>public work</span>
                <strong>{counts.all}</strong>
              </div>
              <div className="frame-signal">
                <span>live renderables</span>
                <strong>{liveCount}</strong>
              </div>
              <div className="frame-signal">
                <span>research trace</span>
                <strong>{counts.research}</strong>
              </div>
              <div className="frame-signal">
                <span>project lineage</span>
                <strong>{counts.project}</strong>
              </div>
            </div>
          </section>

          <section className="frame-gallery" id="work" aria-labelledby="frame-work-title">
            <header className="frame-gallery-header">
              <div>
                <div className="frame-section-label">gallery</div>
                <h3 id="frame-work-title">Artifacts, projects, and notes</h3>
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
                  onClick={() => navigate(`/u/${handle}?view=canvas`)}
                  title="Canvas view"
                >
                  canvas
                </button>
              </div>
            </header>

            <div className="frame-tabs" role="tablist" aria-label="Filter profile work">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`frame-tab${filter === key ? ' is-active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span className="frame-tab-count">{counts[key]}</span>
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="frame-empty">
                <div className="frame-empty-glyph">┌ ┘</div>
                <div className="frame-empty-title">
                  {isOwner ? 'This section is empty.' : 'Nothing public here yet.'}
                </div>
                {isOwner && (
                  <button
                    type="button"
                    className="frame-btn frame-btn-primary"
                    onClick={() => navigate(`/u/${handle}/edit`)}
                  >
                    <PenLine size={13} />
                    add work
                  </button>
                )}
              </div>
            ) : (
              <div className="frame-grid">
                {visible.map((item) => (
                  <ArtifactCardTile key={item.id} item={item} onOpen={setSelected} />
                ))}
              </div>
            )}
          </section>

          <div className="frame-lower-grid">
            <section className="frame-panel" id="research" aria-labelledby="frame-research-title">
              <div className="frame-panel-head">
                <div>
                  <div className="frame-section-label">research trace</div>
                  <h3 id="frame-research-title">Questions, citations, field notes</h3>
                </div>
                <FlaskConical size={15} />
              </div>
              {researchItems.length > 0 ? (
                <div className="frame-list">
                  {researchItems.map((item) => (
                    <button key={item.id} type="button" className="frame-list-row" onClick={() => setSelected(item)}>
                      <span>{itemTitle(item)}</span>
                      <small>{relativeDate(item.created_at)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="frame-panel-empty">No public research notes yet.</div>
              )}
            </section>

            <section className="frame-panel" aria-labelledby="frame-project-title">
              <div className="frame-panel-head">
                <div>
                  <div className="frame-section-label">project lineage</div>
                  <h3 id="frame-project-title">Builds and ongoing systems</h3>
                </div>
                <FileText size={15} />
              </div>
              {projectItems.length > 0 ? (
                <div className="frame-list">
                  {projectItems.map((item) => (
                    <button key={item.id} type="button" className="frame-list-row" onClick={() => setSelected(item)}>
                      <span>{itemTitle(item)}</span>
                      <small>{relativeDate(item.created_at)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="frame-panel-empty">No public projects classified yet.</div>
              )}
            </section>
          </div>

          <section className="frame-timeline" aria-label="Recent public work">
            <div className="frame-section-label">timeline</div>
            <div className="frame-timeline-track">
              {sortedItems.slice(0, 7).map((item) => (
                <button key={item.id} type="button" className="frame-timeline-point" onClick={() => setSelected(item)}>
                  <span>{relativeDate(item.created_at)}</span>
                  <strong>{itemTitle(item)}</strong>
                </button>
              ))}
            </div>
          </section>
        </section>
      </main>

      {selected && <ItemLightbox item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
