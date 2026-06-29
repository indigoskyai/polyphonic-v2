/**
 * ArtifactCardTile — structured "card" presentation of any profile_item.
 * Used by the Frame (grid) view. Distinct from the canvas tile, which renders
 * the raw artifact in a draggable container.
 *
 * Visual model: borrowed from nexus_artifacts_v3 — soft preview surface,
 * hover-revealed action buttons, mono "// type" label, monochromatic only.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProfileItem } from '@/stores/profileCanvasStore';
import type { Artifact } from '@/stores/artifactStore';
import ArtifactRenderer from '@/components/canvas/ArtifactRenderer';
import RichBody from '@/components/rich/RichBody';
import { ExternalLink, Maximize2 } from 'lucide-react';

interface Props {
  item: ProfileItem;
  onOpen?: (item: ProfileItem) => void;
}

function publicUrl(path: string): string {
  const { data } = (supabase as any).storage.from('profile-uploads').getPublicUrl(path.replace(/^profile-uploads\//, ''));
  return data?.publicUrl || '';
}

function typeLabel(item: ProfileItem): string {
  if (item.item_type === 'artifact') {
    const k = (item.payload as any)?.snapshot?.kind || (item.payload as any)?.kind;
    if (k && ['html', 'react', 'svg'].includes(String(k).toLowerCase())) return `live · ${k}`;
    return k ? `artifact · ${k}` : 'artifact';
  }
  if (item.item_type === 'upload') {
    const m = (item.payload as any)?.mime || '';
    if (m.startsWith('image/')) return 'image';
    if (m.includes('pdf')) return 'document · pdf';
    return 'file';
  }
  return 'note';
}

function titleFor(item: ProfileItem): string {
  if (item.item_type === 'artifact') {
    return (item.payload as any)?.snapshot?.title
      || (item.payload as any)?.title
      || 'Untitled artifact';
  }
  if (item.item_type === 'upload') {
    return (item.payload as any)?.original_name || 'Upload';
  }
  // Note: derive title from first heading or first 50 chars
  const md: string = (item.payload as any)?.markdown || '';
  const heading = md.match(/^#+\s+(.+)$/m);
  if (heading) return heading[1].trim();
  const first = md.split('\n').find((l) => l.trim().length > 0) || 'Note';
  return first.replace(/[#*_`]/g, '').slice(0, 60).trim() || 'Note';
}

function ArtifactPreviewBody({ item }: { item: ProfileItem }) {
  const [artifact, setArtifact] = useState<Artifact | null>(
    (item.payload as any)?.snapshot || null,
  );
  const artifactId = (item.payload as any)?.artifact_id;

  useEffect(() => {
    if (artifact || !artifactId) return;
    let cancelled = false;
    (supabase as any).from('artifacts').select('*').eq('id', artifactId).maybeSingle()
      .then(({ data }: { data: Artifact | null }) => {
        if (!cancelled && data) setArtifact(data);
      });
    return () => { cancelled = true; };
  }, [artifactId, artifact]);

  if (!artifact) {
    return (
      <div className="frame-tile-preview-empty">
        <span className="mono-label">loading</span>
      </div>
    );
  }
  return (
    <div className="frame-tile-preview-artifact">
      <ArtifactRenderer artifact={artifact} compact />
    </div>
  );
}

function NotePreviewBody({ item }: { item: ProfileItem }) {
  const md: string = (item.payload as any)?.markdown || '';
  return (
    <div className="frame-tile-preview-note">
      <RichBody source={md.slice(0, 400)} />
    </div>
  );
}

function UploadPreviewBody({ item }: { item: ProfileItem }) {
  const path = (item.payload as any)?.storage_path;
  const mime = (item.payload as any)?.mime || '';
  const url = useMemo(() => (path ? publicUrl(path) : ''), [path]);
  if (mime.startsWith('image/')) {
    return (
      <img
        src={url}
        alt={(item.payload as any)?.original_name || ''}
        className="frame-tile-preview-image"
        loading="lazy"
        draggable={false}
      />
    );
  }
  return (
    <div className="frame-tile-preview-empty">
      <span className="mono-label">{mime || 'file'}</span>
    </div>
  );
}

export default function ArtifactCardTile({ item, onOpen }: Props) {
  const label = typeLabel(item);
  const title = titleFor(item);
  const kind = String((item.payload as any)?.snapshot?.kind || (item.payload as any)?.kind || '').toLowerCase();
  const isLiveArtifact = item.item_type === 'artifact' && ['html', 'react', 'svg'].includes(kind);

  return (
    <article
      className="frame-tile"
      onClick={() => onOpen?.(item)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(item); } }}
    >
      <div className="frame-tile-preview">
        {item.item_type === 'artifact' && <ArtifactPreviewBody item={item} />}
        {item.item_type === 'note' && <NotePreviewBody item={item} />}
        {item.item_type === 'upload' && <UploadPreviewBody item={item} />}
        {isLiveArtifact && <span className="frame-tile-live">live html</span>}

        <div className="frame-tile-actions">
          <button
            type="button"
            className="frame-tile-action"
            aria-label={`Open ${title}`}
            onClick={(e) => { e.stopPropagation(); onOpen?.(item); }}
          >
            <Maximize2 size={11} /> open
          </button>
          {item.item_type === 'upload' && (
            <a
              className="frame-tile-action"
              href={publicUrl((item.payload as any)?.storage_path)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={11} /> raw
            </a>
          )}
        </div>
      </div>

      <div className="frame-tile-info">
        <div className="frame-tile-type">{label}</div>
        <div className="frame-tile-title">{title}</div>
        {item.caption && <div className="frame-tile-caption">{item.caption}</div>}
      </div>
    </article>
  );
}
