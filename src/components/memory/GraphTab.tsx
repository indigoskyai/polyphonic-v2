import { useRef, useEffect, useCallback, useState } from 'react';
import { useMemoryStore, type Engram, type Connection } from '@/stores/memoryStore';

const TYPE_COLORS: Record<string, string> = {
  episodic: '#5b8aad',
  semantic: '#c9a87c',
  procedural: '#8ca89c',
  belief: '#a88cc9',
};

const CONN_COLORS: Record<string, string> = {
  supports: '#8ca89c40',
  contradicts: '#ad5b5b40',
  causes: '#c9a87c40',
  extends: '#5b8aad40',
  parallels: '#a88cc940',
  synthesizes: '#c9a87c40',
  grounds: '#8ca89c40',
};

interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  engram: Engram;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
  connection: Connection;
}

export default function GraphTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { engrams, connections, setSelectedEngram, selectedEngram } = useMemoryStore();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const nodesRef = useRef<Map<string, GraphNode>>(new Map());
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedEngram?.id ?? null;

  // Initialize nodes and edges from data
  useEffect(() => {
    const nodes = new Map<string, GraphNode>();
    const activeEngrams = engrams.filter((e) => e.state === 'active' || e.state === 'consolidating');

    activeEngrams.forEach((engram, i) => {
      const angle = (i / activeEngrams.length) * Math.PI * 2;
      const radius = 150 + Math.random() * 100;
      nodes.set(engram.id, {
        id: engram.id,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        engram,
        radius: 4 + engram.strength * 8,
      });
    });

    const edges: GraphEdge[] = connections
      .filter((c) => nodes.has(c.source_id) && nodes.has(c.target_id))
      .map((c) => ({ source: c.source_id, target: c.target_id, connection: c }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [engrams, connections]);

  // Physics simulation + render loop
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

      // Repulsion between nodes
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

      // Spring forces along edges
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

      // Gravity toward center + damping
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

      // Draw edges (highlight edges connected to selected node)
      for (const edge of edgesRef.current) {
        const a = nodesRef.current.get(edge.source);
        const b = nodesRef.current.get(edge.target);
        if (!a || !b) continue;
        const isConnectedToSelected = selectedId && (edge.source === selectedId || edge.target === selectedId);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (isConnectedToSelected) {
          ctx.strokeStyle = 'rgba(220,219,216,0.45)';
          ctx.lineWidth = Math.max(0.8, edge.connection.weight * 2.5) / cam.zoom;
        } else {
          ctx.strokeStyle = CONN_COLORS[edge.connection.connection_type] || 'rgba(220,219,216,0.06)';
          ctx.lineWidth = Math.max(0.5, edge.connection.weight * 2) / cam.zoom;
        }
        ctx.stroke();
      }

      // Draw nodes
      const nodes = Array.from(nodesRef.current.values());
      for (const node of nodes) {
        ctx.beginPath();
        const r = node.radius / cam.zoom;
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        const color = TYPE_COLORS[node.engram.engram_type] || '#dcdbd8';
        const isHovered = hoveredNode === node.id;
        const isSelected = selectedId === node.id;
        ctx.fillStyle = isHovered || isSelected ? color : `${color}80`;
        ctx.fill();

        if (isSelected) {
          // Bright outer ring + halo
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(244, 243, 240, 0.95)';
          ctx.lineWidth = 1.5 / cam.zoom;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(244, 243, 240, 0.18)';
          ctx.lineWidth = 1 / cam.zoom;
          ctx.stroke();
        } else if (isHovered) {
          ctx.strokeStyle = color;
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
  }, [engrams, connections, hoveredNode]);

  // Mouse interaction
  const getNodeAtPos = useCallback((clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const x = (clientX - rect.left - rect.width / 2 - cam.x) / cam.zoom;
    const y = (clientY - rect.top - rect.height / 2 - cam.y) / cam.zoom;

    for (const node of nodesRef.current.values()) {
      const dx = node.x - x, dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.radius / cam.zoom + 5) return node;
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
  }, [getNodeAtPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = getNodeAtPos(e.clientX, e.clientY);
    if (node) {
      setSelectedEngram(node.engram);
    } else {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
    }
  }, [getNodeAtPos, setSelectedEngram]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    cameraRef.current.zoom = Math.max(0.2, Math.min(5, cameraRef.current.zoom * delta));
  }, []);

  const nodeCount = engrams.filter((e) => e.state === 'active' || e.state === 'consolidating').length;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 400 }}>
      {nodeCount === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-ghost)', fontSize: 12 }}>
          No engrams to visualize. Memories will appear here after conversations.
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', cursor: dragRef.current.dragging ? 'grabbing' : hoveredNode ? 'pointer' : 'grab' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      )}

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 12 }}>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 9, color: 'var(--text-ghost)', letterSpacing: '0.04em' }}>{type}</span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
        {nodeCount} nodes / {edgesRef.current.length} edges
      </div>
    </div>
  );
}
