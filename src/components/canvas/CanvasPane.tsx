import { useEffect, useMemo, useState } from 'react';
import ArtifactRenderer from '@/components/canvas/ArtifactRenderer';
import { useArtifactStore, type Artifact } from '@/stores/artifactStore';
import { useCanvasStore, CANVAS_MIN_WIDTH, CANVAS_MAX_WIDTH } from '@/stores/canvasStore';

/**
 * The artifact canvas — a side pane that opens like Claude Artifacts /
 * ChatGPT Canvas. Rendered inside `.chat-view`; the open/closed slide and the
 * chat reflow are driven by `data-canvas-open` + the `--canvas-w` CSS var that
 * ChatView sets. Resizing writes `--canvas-w` directly during the drag (no
 * ChatView re-render) and commits to the store on release.
 */
export default function CanvasPane() {
  const isOpen = useCanvasStore((s) => s.isOpen);
  const activeId = useCanvasStore((s) => s.activeArtifactId);
  const view = useCanvasStore((s) => s.view);
  const fullscreen = useCanvasStore((s) => s.fullscreen);
  const setView = useCanvasStore((s) => s.setView);
  const setFullscreen = useCanvasStore((s) => s.setFullscreen);
  const setWidth = useCanvasStore((s) => s.setWidth);
  const close = useCanvasStore((s) => s.close);

  const byThread = useArtifactStore((s) => s.byThread);
  const loadOne = useArtifactStore((s) => s.loadOne);
  const [loaded, setLoaded] = useState<Artifact | null>(null);

  const fromThread = useMemo(() => {
    if (!activeId) return null;
    for (const list of Object.values(byThread)) {
      const a = list.find((x) => x.id === activeId);
      if (a) return a;
    }
    return null;
  }, [byThread, activeId]);

  const artifact = fromThread || (loaded && loaded.id === activeId ? loaded : null);

  // Fall back to a direct fetch if the artifact isn't already in the thread cache.
  useEffect(() => {
    if (activeId && !fromThread) loadOne(activeId).then(setLoaded);
  }, [activeId, fromThread, loadOne]);

  // Esc closes (when not fullscreen-trapped elsewhere).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (fullscreen) setFullscreen(false); else close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, fullscreen, close, setFullscreen]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const root = document.querySelector('.chat-view') as HTMLElement | null;
    document.body.setAttribute('data-canvas-resizing', '1');
    let w = useCanvasStore.getState().width;
    const onMove = (ev: MouseEvent) => {
      w = Math.max(CANVAS_MIN_WIDTH, Math.min(CANVAS_MAX_WIDTH, window.innerWidth - ev.clientX));
      if (root) root.style.setProperty('--canvas-w', `${w}px`);
    };
    const onUp = () => {
      document.body.removeAttribute('data-canvas-resizing');
      setWidth(w);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <aside className="canvas-pane" data-fullscreen={fullscreen ? 'true' : undefined} aria-hidden={!isOpen}>
      <div className="canvas-resize-handle" onMouseDown={startResize} role="separator" aria-label="Resize canvas" />
      <div className="canvas-pane-inner">
        {artifact ? (
          <ArtifactRenderer
            artifact={artifact}
            fill
            view={view}
            onViewChange={setView}
            onClose={close}
            onToggleFullscreen={() => setFullscreen(!fullscreen)}
            isFullscreen={fullscreen}
            inCanvas
          />
        ) : (
          <div className="canvas-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {activeId ? 'Loading artifact…' : 'No artifact selected'}
          </div>
        )}
      </div>
    </aside>
  );
}
