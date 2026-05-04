import ArtifactRenderer from '@/components/canvas/ArtifactRenderer';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Artifact } from '@/stores/artifactStore';

interface Props {
  payload: { artifact_id?: string; snapshot?: Artifact };
  mode: 'view' | 'edit';
  interacting: boolean;
}

export default function ArtifactTile({ payload, mode, interacting }: Props) {
  const [artifact, setArtifact] = useState<Artifact | null>(payload.snapshot || null);
  useEffect(() => {
    if (artifact || !payload.artifact_id) return;
    let cancelled = false;
    (supabase as any).from('artifacts').select('*').eq('id', payload.artifact_id).maybeSingle()
      .then(({ data }: { data: Artifact | null }) => { if (!cancelled && data) setArtifact(data); });
    return () => { cancelled = true; };
  }, [payload.artifact_id, artifact]);

  if (!artifact) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        loading artifact…
      </div>
    );
  }

  // In edit mode, or while dragging, lock pointer events so the iframe doesn't eat drags.
  const lock = mode === 'edit' || interacting;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ pointerEvents: lock ? 'none' : 'auto', height: '100%' }}>
        <ArtifactRenderer artifact={artifact} compact />
      </div>
    </div>
  );
}
