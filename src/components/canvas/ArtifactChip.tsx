import { Globe, Atom, Shapes, Workflow, FileText, FileCode2, ExternalLink, FlaskConical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import type { Artifact, ArtifactKind } from '@/stores/artifactStore';
import SimulationCard from '@/components/simulations/SimulationCard';

const KIND_META: Record<ArtifactKind, { icon: LucideIcon; label: string }> = {
  html: { icon: Globe, label: 'HTML page' },
  react: { icon: Atom, label: 'React app' },
  svg: { icon: Shapes, label: 'SVG graphic' },
  mermaid: { icon: Workflow, label: 'Diagram' },
  markdown: { icon: FileText, label: 'Document' },
  simulation: { icon: FlaskConical, label: 'Simulation' },
};

/** Compact launcher shown inline in a message; opens the artifact in the canvas
 *  pane (like Claude's artifact pill). Replaces the old inline preview card. */
export default function ArtifactChip({ artifact }: { artifact: Artifact }) {
  if (artifact.kind === 'simulation') {
    return <SimulationCard artifact={artifact} compact />;
  }

  const open = useCanvasStore((s) => s.open);
  const activeId = useCanvasStore((s) => s.activeArtifactId);
  const isOpen = useCanvasStore((s) => s.isOpen);
  const active = isOpen && activeId === artifact.id;

  const meta = KIND_META[artifact.kind] || { icon: FileCode2, label: artifact.kind };
  const Icon = meta.icon;

  return (
    <button
      type="button"
      className={`artifact-chip${active ? ' is-active' : ''}`}
      onClick={() => open(artifact.id)}
      title="Open in canvas"
    >
      <span className="artifact-chip-icon"><Icon size={16} strokeWidth={1.6} /></span>
      <span className="artifact-chip-text">
        <span className="artifact-chip-title">{artifact.title || meta.label}</span>
        <span className="artifact-chip-sub">
          {meta.label}{artifact.version > 1 ? ` · v${artifact.version}` : ''} · click to open
        </span>
      </span>
      <span className="artifact-chip-open" aria-hidden="true"><ExternalLink size={13} strokeWidth={1.7} /></span>
    </button>
  );
}

/** Non-interactive placeholder shown while an artifact is still streaming in —
 *  we don't run partial code, so this stands in until the finished artifact
 *  persists and the canvas opens. */
export function StreamingArtifactChip({ artifact }: { artifact: Artifact }) {
  if (artifact.kind === 'simulation') {
    return <SimulationCard artifact={artifact} compact streaming />;
  }

  const meta = KIND_META[artifact.kind] || { icon: FileCode2, label: artifact.kind };
  const Icon = meta.icon;
  return (
    <div className="artifact-chip is-building" aria-live="polite">
      <span className="artifact-chip-icon"><Icon size={16} strokeWidth={1.6} /></span>
      <span className="artifact-chip-text">
        <span className="artifact-chip-title">{artifact.title || meta.label}</span>
        <span className="artifact-chip-sub">{meta.label} · building<span className="artifact-chip-dots" /></span>
      </span>
    </div>
  );
}
