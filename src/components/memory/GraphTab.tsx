/**
 * GraphTab — Round 2 force-directed graph for the Mnemos substrate.
 *
 * Surface chrome: folio strip + hero ("# 04 · MNEMOS · CONNECTION GRAPH") + canvas.
 * Visual language: monochrome cream, hairline edges, tiny disc nodes with hover labels,
 * cool-blue selection ring, footer legend & stats.
 *
 * Physics: spring-damper sim with center gravity. DPR-aware. Pan + zoom via mouse.
 */
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useMemoryStore, type Engram, type Connection } from '@/stores/memoryStore';
import { useDrawerStore } from '@/stores/drawerStore';

const TYPE_TINTS: Record<string, string> = {
  episodic:   'rgba(190, 200, 215, 1)',
  semantic:   'rgba(215, 205, 185, 1)',
  procedural: 'rgba(195, 205, 200, 1)',
  belief:     'rgba(205, 195, 215, 1)',
};

const NODE_FILL_DIM     = 'rgba(220, 219, 216, 0.10)';
const NODE_STROKE       = 'rgba(220, 219, 216, 0.55)';
const NODE_STROKE_HOVER = 'rgba(244, 243, 240, 0.95)';
const SELECT_RING       = 'rgba(140, 175, 210, 0.95)';
const SELECT_HALO       = 'rgba(140, 175, 210, 0.22)';
const EDGE_HIGHLIGHT    = 'rgba(220, 219, 216, 0.55)';

interface GraphNode {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  engram: Engram;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
  connection: Connection;
}

function fmtClock(d = new Date()): string {
  return d.toTimeString().slice(0, 5);
}

export default function GraphTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { engrams, connections, setSelectedEngram, selectedEngram } = useMemoryStore();
  const openDrawer = useDrawerStore((s) => s.open);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const nodesRef = useRef<Map<string, GraphNode>>(new Map());
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedEngram?.id ?? null;
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hoveredNode;

  const activeEngrams = useMemo(
    () => engrams.filter((e) => e.state === 'active' || e.state === 'consolidating'),
    [engrams]
  );

  // Stats
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const t of Object.keys(TYPE_TINTS)) byType[t] = 0;
    for (const e of activeEngrams) {
      if (byType[e.engram_type] !== undefined) byType[e.engram_type]++;
    }
    const validEdges = edgesRef.current.length;
    const density = activeEngrams.length > 1
      ? validEdges / (activeEngrams.length * (activeEngrams.length - 1) / 2)
      : 0;
    return { byType, nodes: activeEngrams.length, edges: validEdges, density };
  }, [activeEngrams, connections]);

  // Initialize nodes/edges when data changes
  useEffect(() => {
    const nodes = new Map<string, GraphNode>();
    activeEngrams.forEach((engram, i) => {
      const angle = (i / activeEngrams.length) * Math.PI * 2;
      const radius = 150 + Math.random() * 100;
      // Reuse position if node already exists to avoid jarring resets
      const prev = nodesRef.current.get(engram.id);
      nodes.set(engram.id, {
        id: engram.id,
        x: prev?.x ?? Math.cos(angle) * radius,
        y: prev?.y ?? Math.sin(angle) * radius,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        engram,
        radius: 3.5 + engram.strength * 3.5,
      });
    });

    const edges: GraphEdge[] = connections
      .filter((c) => nodes.has(c.source_id) && nodes.has(c.target_id))
      .map((c) => ({ source: c.source_id, target: c.target_id, connection: c }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [activeEngrams, connections]);

  // Physics + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = container.clientWidth * window.devicePixelRatio;
      canvas.height = container.clientHeight * window.devicePixelRatio;
      canvas.style.width = container.clientWidth + 'px';
      canvas.style.height = container.clientHeight + 'px';
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const simulate = () => {
      const nodes = Array.from(nodesRef.current.values());
      const edges = edgesRef.current;
      const dt = 0.3;

      // Pairwise repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx -= fx * dt; a.vy -= fy * dt;
          b.vx += fx * dt; b.vy += fy * dt;
        }
      }

      // Springs along edges
      for (const edge of edges) {
        const a = nodesRef.current.get(edge.source);
        const b = nodesRef.current.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const restLength = 80;
        const springK = 0.02 * edge.connection.weight;
        const displacement = dist - restLength;
        const fx = (dx / dist) * displacement * springK;
        const fy = (dy / dist) * displacement * springK;
        a.vx += fx * dt; a.vy += fy * dt;
        b.vx -= fx * dt; b.vy -= fy * dt;
      }

      // Gravity + damping
      for (const node of nodes) {
        node.vx -= node.x * 0.001 * dt;
        node.vy -= node.y * 0.001 * dt;
        node.vx *= 0.95;
        node.vy *= 0.95;
        node.x += node.vx;
        node.y += node.vy;
      }
    };

    const render = () => {
      const w = canvas.width, h = canvas.height;
      const dpr = window.devicePixelRatio;
      const cam = cameraRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(cam.zoom * dpr, 0, 0, cam.zoom * dpr, w / 2 + cam.x * dpr, h / 2 + cam.y * dpr);

      const selectedId = selectedIdRef.current;
      const hoveredId = hoveredRef.current;

      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';

      // Edges
      for (const edge of edgesRef.current) {
        const a = nodesRef.current.get(edge.source);
        const b = nodesRef.current.get(edge.target);
        if (!a || !b) continue;
        const isConnectedToSelected = selectedId && (edge.source === selectedId || edge.target === selectedId);
        const isConnectedToHover = hoveredId && (edge.source === hoveredId || edge.target === hoveredId);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (isConnectedToSelected || isConnectedToHover) {
          ctx.strokeStyle = EDGE_HIGHLIGHT;
          ctx.lineWidth = 0.8 / cam.zoom;
        } else {
          const baseAlpha = 0.06 + Math.min(0.12, edge.connection.weight * 0.10);
          ctx.strokeStyle = `rgba(220, 219, 216, ${baseAlpha.toFixed(3)})`;
          ctx.lineWidth = 0.5 / cam.zoom;
        }
        ctx.stroke();
      }

      // Nodes
      const nodes = Array.from(nodesRef.current.values());
      for (const node of nodes) {
        const r = node.radius / cam.zoom;
        const tint = TYPE_TINTS[node.engram.engram_type] || 'rgba(220,219,216,1)';
        const isHovered = hoveredId === node.id;
        const isSelected = selectedId === node.id;

        // Filled disc
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        if (isSelected || isHovered) {
          ctx.fillStyle = tint.replace(/, 1\)$/, ', 0.35)');
        } else {
          ctx.fillStyle = NODE_FILL_DIM;
        }
        ctx.fill();

        // Crisp 1px ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = isHovered ? NODE_STROKE_HOVER : NODE_STROKE;
        ctx.lineWidth = 1 / cam.zoom;
        ctx.stroke();

        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = SELECT_RING;
          ctx.lineWidth = 1.2 / cam.zoom;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = SELECT_HALO;
          ctx.lineWidth = 1 / cam.zoom;
          ctx.stroke();
        }
      }

      simulate();
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, [activeEngrams, connections]);

  const getNodeAtPos = useCallback((clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const x = (clientX - rect.left - rect.width / 2 - cam.x) / cam.zoom;
    const y = (clientY - rect.top - rect.height / 2 - cam.y) / cam.zoom;
    for (const node of nodesRef.current.values()) {
      const dx = node.x - x, dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < node.radius / cam.zoom + 5) return node;
    }
    return null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.dragging) {
      cameraRef.current.x += e.clientX - dragRef.current.lastX;
      cameraRef.current.y += e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      return;
    }
    const node = getNodeAtPos(e.clientX, e.clientY);
    setHoveredNode(node?.id || null);
    if (node) {
      const rect = canvasRef.current!.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setCursorPos(null);
    }
  }, [getNodeAtPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = getNodeAtPos(e.clientX, e.clientY);
    if (node) {
      setSelectedEngram(node.engram);
      openDrawer('memory-detail', { engramId: node.engram.id });
    } else {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
    }
  }, [getNodeAtPos, setSelectedEngram, openDrawer]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    cameraRef.current.zoom = Math.max(0.2, Math.min(5, cameraRef.current.zoom * delta));
  }, []);

  const hoveredEngram = hoveredNode ? nodesRef.current.get(hoveredNode)?.engram : null;

  return (
    <div className="s-stream" style={{ height: '100%' }}>
      {/* Folio strip */}
      <div className="r2-folio">
        <div className="r2-folio-left">
          <span><span className="agent-dot" /> mnemos</span>
          <span>session 001{/* MOCK */}</span>
        </div>
        <div className="r2-folio-right">
          <span>claude-sonnet-4.5</span>
          <span>{fmtClock()}</span>
        </div>
      </div>

      {/* Hero — matches mockup: # 02 · LIVING MEMORY SUBSTRATE · N ACTIVE / "Mnemos" */}
      <div style={{ padding: '0 36px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        <div className="s-hero" style={{ paddingBottom: 18 }}>
          <div className="s-hero-eye">
            <span className="num"># 02</span>
            <span>·</span>
            <span className="v">Living Memory Substrate</span>
            <span>·</span>
            <span className="stream">{stats.nodes} active</span>
          </div>
          <h1 className="s-hero-title">Mnemos</h1>
        </div>
      </div>

      {/* Canvas surface — flush, no border. In-canvas eyebrow row. */}
      <div
        ref={containerRef}
        style={{
          flex: 1, position: 'relative', minHeight: 0,
          margin: '0 36px 24px',
          maxWidth: 'calc(1280px - 72px)',
          width: 'auto',
          alignSelf: 'center',
          marginLeft: 'auto', marginRight: 'auto',
          borderTop: '1px solid var(--hairline)',
          overflow: 'hidden',
        }}
      >
        {/* In-canvas eyebrow: MNEMOS GRAPH ··· ALL */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 4px',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-whisper)',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
            }}
          >
            Mnemos Graph
          </span>
          <button
            type="button"
            style={{
              pointerEvents: 'auto',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--ink, var(--text-primary))',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              padding: '6px 14px',
              border: '1px solid var(--hairline)',
              borderRadius: 999,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            All
          </button>
        </div>

        {stats.nodes === 0 ? (
          <div className="s-empty" style={{ height: '100%' }}>
            No engrams to visualize. Memories will form connections after conversations.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', height: '100%',
              cursor: dragRef.current.dragging ? 'grabbing' : hoveredNode ? 'pointer' : 'grab',
              display: 'block',
            }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { handleMouseUp(); setHoveredNode(null); setCursorPos(null); }}
            onWheel={handleWheel}
          />
        )}

        {/* Hover tooltip */}
        {hoveredEngram && cursorPos && (
          <div
            style={{
              position: 'absolute',
              left: cursorPos.x + 14,
              top: cursorPos.y + 14,
              maxWidth: 280,
              padding: '10px 12px',
              background: 'var(--surface-3)',
              border: '1px solid var(--hairline)',
              borderRadius: 6,
              pointerEvents: 'none',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 10,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-whisper)', letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
            }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: TYPE_TINTS[hoveredEngram.engram_type],
              }} />
              <span style={{ color: 'var(--text-soft)' }}>{hoveredEngram.engram_type}</span>
              <span>·</span>
              <span>{hoveredEngram.state}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-soft)' }}>
                {hoveredEngram.strength.toFixed(2)}
              </span>
            </div>
            <div style={{
              fontFamily: 'var(--font-sans)', fontSize: 12,
              color: 'var(--text-primary)', lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {hoveredEngram.content}
            </div>
          </div>
        )}
      </div>

      {/* Footer eyebrow — N engrams · N connections (matches mockup baseline) */}
      <div
        style={{
          padding: '0 36px 22px',
          maxWidth: 1280,
          margin: '0 auto',
          width: '100%',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-whisper)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {stats.nodes} engrams · {stats.edges} connections
      </div>
    </div>
  );
}
