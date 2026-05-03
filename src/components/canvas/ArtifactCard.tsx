import ArtifactRenderer from './ArtifactRenderer';
import type { Artifact } from '@/stores/artifactStore';

export default function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <div style={{ marginTop: 14 }}>
      <ArtifactRenderer artifact={artifact} compact />
    </div>
  );
}
