import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import Widget from './Widget';
import type { DashboardWidget } from './dashboardStore';

interface Props {
  widgets: DashboardWidget[];
  onReorder: (ids: string[]) => void;
  onArchive: (id: string) => void;
  onRegenerate: (id: string) => void;
  onReprompt: (id: string, p: string) => void;
  onTogglePin: (id: string) => void;
}

export default function Atelier({ widgets, onReorder, onArchive, onRegenerate, onReprompt, onTogglePin }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = widgets.map((w) => w.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  if (widgets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ padding: 40 }}>
        <div className="text-center" style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Your dashboard is empty.</div>
          <div style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.6 }}>
            Pick a starter below or describe what you want to see in the prompt bar — the AI will design and pin a widget for you.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: '20px 28px' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {widgets.map((w) => (
              <Widget
                key={w.id}
                widget={w}
                onArchive={onArchive}
                onRegenerate={onRegenerate}
                onReprompt={onReprompt}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
