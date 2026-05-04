import { useProfileCanvasStore } from '@/stores/profileCanvasStore';

export type LayoutKey = 'studio' | 'grid' | 'constellation' | 'hero';

const TEMPLATES: Record<LayoutKey, { label: string; description: string; items: Array<{ x: number; y: number; w: number; h: number; markdown: string; caption?: string }> }> = {
  studio: {
    label: 'Studio Wall',
    description: 'A loose, hand-arranged composition. Big anchor pieces with small studies clustered around them.',
    items: [
      { x: 0, y: 0, w: 460, h: 320, markdown: '# Welcome\n\nReplace this with your hero piece — a flagship project, paper, or app.' },
      { x: 500, y: 40, w: 280, h: 200, markdown: '## About\n\nA short note about who you are and what you make.' },
      { x: 80, y: 360, w: 240, h: 200, markdown: '*Sketch / experiment*' },
      { x: 350, y: 380, w: 240, h: 200, markdown: '*Reading list*' },
      { x: 620, y: 280, w: 280, h: 240, markdown: '## Currently working on\n\n- thing one\n- thing two' },
    ],
  },
  grid: {
    label: 'Grid',
    description: 'A clean 3-column grid. Best for showing many small pieces of equal weight.',
    items: Array.from({ length: 6 }).map((_, i) => ({
      x: (i % 3) * 320, y: Math.floor(i / 3) * 280,
      w: 280, h: 240, markdown: `*Item ${i + 1}*`,
    })),
  },
  constellation: {
    label: 'Constellation',
    description: 'Items orbit a central anchor. Reads like a mind-map of your work.',
    items: [
      { x: 280, y: 220, w: 320, h: 220, markdown: '# Anchor\n\nThe single piece your other work revolves around.' },
      { x: -40, y: 60,  w: 240, h: 180, markdown: '*Orbit 1*' },
      { x: 660, y: 60,  w: 240, h: 180, markdown: '*Orbit 2*' },
      { x: -40, y: 480, w: 240, h: 180, markdown: '*Orbit 3*' },
      { x: 660, y: 480, w: 240, h: 180, markdown: '*Orbit 4*' },
    ],
  },
  hero: {
    label: 'Single Hero',
    description: 'One enormous piece. Everything else lives off-canvas until you place it.',
    items: [
      { x: 0, y: 0, w: 880, h: 560, markdown: '# Your hero piece\n\nDouble-click in edit mode to replace this with your flagship work.' },
    ],
  },
};

interface Props { onClose: () => void; }

export default function StarterLayoutPicker({ onClose }: Props) {
  const addItem = useProfileCanvasStore((s) => s.addItem);

  const apply = async (key: LayoutKey) => {
    const tpl = TEMPLATES[key];
    for (const it of tpl.items) {
      await addItem({
        item_type: 'note',
        x: it.x, y: it.y, w: it.w, h: it.h, z: 0, rotation: 0,
        payload: { markdown: it.markdown },
        caption: it.caption || null,
        published: true,
      });
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 30,
        background: 'rgba(10,10,12,0.78)', backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ width: 'min(820px, 92vw)', padding: 32 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--track-mono)', color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 8 }}>
          § choose a starting layout
        </div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--text-primary)', margin: 0, marginBottom: 6 }}>
          How should your canvas begin?
        </h2>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, marginBottom: 24, maxWidth: 540 }}>
          Pick a starting arrangement. Every item is editable — drag, resize, replace, delete. You can also skip and start with a blank canvas.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {(Object.keys(TEMPLATES) as LayoutKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => apply(key)}
              style={{
                textAlign: 'left', background: 'var(--surface-1)', border: '1px solid var(--border-faint)',
                borderRadius: 12, padding: 18, cursor: 'pointer', color: 'var(--text-body)',
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.borderColor = 'var(--border-faint)'; }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: 'var(--track-mono)' }}>
                template
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginTop: 4 }}>
                {TEMPLATES[key].label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 8, lineHeight: 1.55 }}>
                {TEMPLATES[key].description}
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--track-mono)',
              color: 'var(--text-soft)', textTransform: 'uppercase',
            }}
          >
            start blank →
          </button>
        </div>
      </div>
    </div>
  );
}
