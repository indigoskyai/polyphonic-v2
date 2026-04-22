import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DashboardWidget, WidgetSpec } from './dashboardStore';
import MetricCard from './widgets/MetricCard';
import NarrativeCard from './widgets/NarrativeCard';
import ListBlock from './widgets/ListBlock';
import TimelineChart from './widgets/TimelineChart';
import HeatmapGrid from './widgets/HeatmapGrid';
import ScatterField from './widgets/ScatterField';
import ComparisonBars from './widgets/ComparisonBars';
import RadialChart from './widgets/RadialChart';
import QuoteStream from './widgets/QuoteStream';

interface Props {
  widget: DashboardWidget;
  onArchive: (id: string) => void;
  onRegenerate: (id: string) => void;
  onReprompt: (id: string, newPrompt: string) => void;
  onTogglePin: (id: string) => void;
}

export default function Widget({ widget, onArchive, onRegenerate, onReprompt, onTogglePin }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(widget.prompt);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const spec = widget.spec as WidgetSpec;
  const isWide = ['timeline', 'heatmap', 'narrative', 'quote_stream'].includes(spec.kind);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        gridColumn: isWide ? 'span 2' : 'span 1',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 180,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div
          {...attributes}
          {...listeners}
          className="flex-1 min-w-0 cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: 'none' }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
            {spec.title}
          </div>
          {spec.subtitle && (
            <div style={{ fontSize: 10, color: 'var(--text-ghost)', marginTop: 2, lineHeight: 1.4 }}>
              {spec.subtitle}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconButton title="Edit prompt" onClick={() => setEditing((v) => !v)}>✎</IconButton>
          <IconButton title="Regenerate data" onClick={() => onRegenerate(widget.id)}>↻</IconButton>
          <IconButton title={widget.pinned ? 'Unpin' : 'Pin'} onClick={() => onTogglePin(widget.id)} active={widget.pinned}>◆</IconButton>
          <IconButton title="Archive" onClick={() => onArchive(widget.id)}>×</IconButton>
        </div>
      </div>

      {/* Edit prompt */}
      {editing && (
        <div className="mb-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Re-describe this widget…"
            style={{
              flex: 1, fontSize: 11, padding: '6px 8px',
              background: 'var(--bg-deep)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button
            onClick={() => { onReprompt(widget.id, draft); setEditing(false); }}
            className="text-[10px] px-2 py-1 rounded"
            style={{ background: 'var(--luca)', color: 'var(--bg-deep)', border: 'none', cursor: 'pointer', fontWeight: 500 }}
          >
            apply
          </button>
        </div>
      )}

      {/* Renderer */}
      <div className="flex-1 min-h-0">
        {spec.kind === 'metric' && <MetricCard widget={widget} />}
        {spec.kind === 'narrative' && <NarrativeCard widget={widget} />}
        {spec.kind === 'list' && <ListBlock widget={widget} />}
        {spec.kind === 'timeline' && <TimelineChart widget={widget} />}
        {spec.kind === 'heatmap' && <HeatmapGrid widget={widget} />}
        {spec.kind === 'scatter' && <ScatterField widget={widget} />}
        {spec.kind === 'comparison' && <ComparisonBars widget={widget} />}
        {spec.kind === 'radial' && <RadialChart widget={widget} />}
        {spec.kind === 'quote_stream' && <QuoteStream widget={widget} />}
      </div>
    </div>
  );
}

function IconButton({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-[11px] rounded"
      style={{
        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--bg-surface)' : 'transparent',
        border: '1px solid transparent',
        color: active ? 'var(--luca)' : 'var(--text-ghost)',
        cursor: 'pointer',
        transition: 'all 120ms ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget.style.background = 'var(--bg-surface)'); (e.currentTarget.style.color = 'var(--text-secondary)'); }}
      onMouseLeave={(e) => { (e.currentTarget.style.background = active ? 'var(--bg-surface)' : 'transparent'); (e.currentTarget.style.color = active ? 'var(--luca)' : 'var(--text-ghost)'); }}
    >
      {children}
    </button>
  );
}
