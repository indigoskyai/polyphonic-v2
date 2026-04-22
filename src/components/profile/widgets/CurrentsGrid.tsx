import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProfileLayoutStore } from '../profileLayoutStore';
import CircadianRadial from './CircadianRadial';
import WeeklyHeatmap from './WeeklyHeatmap';
import RecurrenceOrbits from './RecurrenceOrbits';
import BeliefDrift from './BeliefDrift';
import QuestionStream from './QuestionStream';

const REGISTRY: Record<string, (p: { dragHandleProps?: Record<string, any> }) => JSX.Element> = {
  'circadian':    CircadianRadial,
  'weekly':       WeeklyHeatmap,
  'recurrence':   RecurrenceOrbits,
  'belief-drift': BeliefDrift,
  'questions':    QuestionStream,
};

function SortableItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const Comp = REGISTRY[id];
  if (!Comp) return null;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <Comp dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export default function CurrentsGrid() {
  const { widgetOrder, setWidgetOrder } = useProfileLayoutStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = widgetOrder.indexOf(active.id as string);
    const newIdx = widgetOrder.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    setWidgetOrder(arrayMove(widgetOrder, oldIdx, newIdx));
  }

  return (
    <div style={{ padding: '14px 24px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-deep)' }}>
      <div style={{
        color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)',
        fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        currents · patterns and rhythms
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={widgetOrder} strategy={rectSortingStrategy}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {widgetOrder.map((id) => <SortableItem key={id} id={id} />)}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
